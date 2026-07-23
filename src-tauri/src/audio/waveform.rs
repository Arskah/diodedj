//! Amplitude-curve (waveform) computation for the seek UI.
//!
//! A track's samples are downsampled to a fixed number of peak buckets
//! ([`WAVEFORM_BUCKETS`]): each bucket holds the maximum absolute sample
//! amplitude over its slice of the track, quantised to a `u8` (0..=255). The
//! resulting ~400-byte blob is stored per track in the DB and rendered behind
//! the deck seek bars so a DJ can see song structure (intro / drop / breakdown)
//! and seek accurately.

use anyhow::{Context, Result};
use rodio::{Decoder, Source};
use std::io::Cursor;
use std::sync::Arc;

/// Number of peak buckets a track is reduced to. 400 gives enough horizontal
/// resolution for a seek bar a few hundred pixels wide while keeping the stored
/// blob tiny (one byte per bucket).
pub const WAVEFORM_BUCKETS: usize = 400;

type Bytes = Arc<[u8]>;

/// Compute the quantised peak curve for an in-memory audio file.
///
/// `duration_hint` (seconds, from tag metadata) lets the common path size the
/// buckets in a single decode pass. When it is missing or non-positive a first
/// counting pass establishes the exact sample total before a second filling
/// pass — correct regardless of the hint, at the cost of decoding twice.
///
/// Returns exactly [`WAVEFORM_BUCKETS`] bytes. Silent or empty tracks yield an
/// all-zero curve rather than an error.
pub fn compute_peaks(bytes: Bytes, duration_hint: Option<f64>) -> Result<Vec<u8>> {
    let decoder = new_decoder(bytes.clone())?;
    let channels = decoder.channels().max(1) as u64;
    let sample_rate = decoder.sample_rate().max(1) as u64;

    // Estimated total interleaved samples = frames * channels. Frames are
    // estimated from the tag duration; None/<=0 falls back to the two-pass path.
    let estimated_samples = duration_hint
        .filter(|d| *d > 0.0)
        .map(|d| (d * sample_rate as f64).ceil() as u64 * channels);

    let total_samples = match estimated_samples {
        Some(n) if n > 0 => n,
        // No usable hint: count samples exactly with a throwaway decode pass.
        _ => new_decoder(bytes.clone())?.count() as u64,
    };

    Ok(fill_buckets(decoder, total_samples))
}

/// Walk the decoded samples, tracking the max absolute amplitude per bucket, and
/// quantise each peak to a `u8`. `total_samples` sizes the buckets; the running
/// index is clamped to the last bucket so a slightly-off estimate never panics
/// and any extra samples fold into the final bucket.
fn fill_buckets<S>(source: S, total_samples: u64) -> Vec<u8>
where
    S: Iterator<Item = f32>,
{
    let mut peaks = vec![0f32; WAVEFORM_BUCKETS];
    if total_samples == 0 {
        return quantise(&peaks);
    }
    // Ceil-divide so every sample maps to a bucket in range.
    let per_bucket = total_samples.div_ceil(WAVEFORM_BUCKETS as u64).max(1);

    for (i, sample) in source.enumerate() {
        let bucket = ((i as u64) / per_bucket).min(WAVEFORM_BUCKETS as u64 - 1) as usize;
        let amp = sample.abs();
        if amp > peaks[bucket] {
            peaks[bucket] = amp;
        }
    }
    quantise(&peaks)
}

/// Map normalised peaks (nominally 0.0..=1.0, clamped) to `u8` 0..=255.
fn quantise(peaks: &[f32]) -> Vec<u8> {
    peaks
        .iter()
        .map(|p| (p.clamp(0.0, 1.0) * 255.0).round() as u8)
        .collect()
}

fn new_decoder(bytes: Bytes) -> Result<Decoder<Cursor<Bytes>>> {
    Decoder::new(Cursor::new(bytes)).context("waveform decoder")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal 16-bit mono PCM WAV whose samples ramp so different buckets get
    /// different peaks — enough to exercise the downsample without a fixture.
    fn synth_wav(sample_rate: u32, samples: u32) -> Vec<u8> {
        let bits = 16u16;
        let channels = 1u16;
        let byte_rate = sample_rate * channels as u32 * (bits as u32 / 8);
        let block_align = channels * (bits / 8);
        let data_len = samples * (bits as u32 / 8);
        let mut w = Vec::new();
        w.extend_from_slice(b"RIFF");
        w.extend_from_slice(&(36 + data_len).to_le_bytes());
        w.extend_from_slice(b"WAVE");
        w.extend_from_slice(b"fmt ");
        w.extend_from_slice(&16u32.to_le_bytes());
        w.extend_from_slice(&1u16.to_le_bytes()); // PCM
        w.extend_from_slice(&channels.to_le_bytes());
        w.extend_from_slice(&sample_rate.to_le_bytes());
        w.extend_from_slice(&byte_rate.to_le_bytes());
        w.extend_from_slice(&block_align.to_le_bytes());
        w.extend_from_slice(&bits.to_le_bytes());
        w.extend_from_slice(b"data");
        w.extend_from_slice(&data_len.to_le_bytes());
        // First half silent, second half full-scale so the curve is clearly
        // low-then-high across buckets.
        for i in 0..samples {
            let v: i16 = if i < samples / 2 { 0 } else { i16::MAX };
            w.extend_from_slice(&v.to_le_bytes());
        }
        w
    }

    fn bytes_of(v: Vec<u8>) -> Bytes {
        Arc::from(v.into_boxed_slice())
    }

    #[test]
    fn returns_fixed_bucket_count() {
        let wav = bytes_of(synth_wav(8000, 8000));
        let peaks = compute_peaks(wav, Some(1.0)).expect("compute");
        assert_eq!(peaks.len(), WAVEFORM_BUCKETS);
    }

    #[test]
    fn silent_half_is_quieter_than_loud_half() {
        let wav = bytes_of(synth_wav(8000, 8000));
        let peaks = compute_peaks(wav, Some(1.0)).expect("compute");
        let first = &peaks[..WAVEFORM_BUCKETS / 2];
        let second = &peaks[WAVEFORM_BUCKETS / 2..];
        let max_first = *first.iter().max().unwrap();
        let min_second = *second.iter().min().unwrap();
        assert!(
            (max_first as u16) < (min_second as u16),
            "silent half {max_first} should be below loud half {min_second}"
        );
    }

    #[test]
    fn loud_half_reaches_full_scale() {
        let wav = bytes_of(synth_wav(8000, 8000));
        let peaks = compute_peaks(wav, Some(1.0)).expect("compute");
        assert_eq!(*peaks.iter().max().unwrap(), 255, "full-scale → 255");
    }

    #[test]
    fn missing_duration_hint_uses_counting_pass() {
        // No hint forces the two-pass path; result must match the hinted path.
        let hinted = compute_peaks(bytes_of(synth_wav(8000, 8000)), Some(1.0)).unwrap();
        let counted = compute_peaks(bytes_of(synth_wav(8000, 8000)), None).unwrap();
        assert_eq!(hinted, counted);
    }

    #[test]
    fn garbage_bytes_error() {
        let bad = bytes_of(vec![0u8, 1, 2, 3, 4, 5]);
        assert!(compute_peaks(bad, Some(1.0)).is_err());
    }

    #[test]
    fn empty_source_yields_zero_curve() {
        let peaks = fill_buckets(std::iter::empty::<f32>(), 0);
        assert_eq!(peaks, vec![0u8; WAVEFORM_BUCKETS]);
    }
}
