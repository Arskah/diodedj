use anyhow::{Context, Result};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::process::{Command, Stdio};

pub const SAMPLE_RATE: u32 = 44100;
pub const CHANNELS: u16 = 2;
pub const BYTES_PER_SAMPLE: u16 = 2;
pub const BYTES_PER_FRAME: u16 = CHANNELS * BYTES_PER_SAMPLE;
pub const PCM_BYTES_PER_SECOND: u32 = SAMPLE_RATE * BYTES_PER_FRAME as u32;
pub const WAV_HEADER_SIZE: u32 = 44;

const FFMPEG_PATH: &str = "ffmpeg";
const FFMPEG_QUIET: &[&str] = &["-nostdin", "-hide_banner", "-loglevel", "error"];
const MOOV_SCAN_BYTES: usize = 64 * 1024;

pub fn pcm_bytes_for_duration(duration_s: f64) -> u64 {
    let total_bytes = duration_s * PCM_BYTES_PER_SECOND as f64;
    let frames = (total_bytes / BYTES_PER_FRAME as f64).floor() as u64;
    frames * BYTES_PER_FRAME as u64
}

pub fn transcoded_total_size(duration_s: f64) -> u64 {
    WAV_HEADER_SIZE as u64 + pcm_bytes_for_duration(duration_s)
}

pub fn build_wav_header(pcm_bytes: u32) -> Vec<u8> {
    let mut buf = Vec::with_capacity(WAV_HEADER_SIZE as usize);
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(36u32 + pcm_bytes).to_le_bytes());
    buf.extend_from_slice(b"WAVE");
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes());
    buf.extend_from_slice(&CHANNELS.to_le_bytes());
    buf.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    buf.extend_from_slice(&PCM_BYTES_PER_SECOND.to_le_bytes());
    buf.extend_from_slice(&BYTES_PER_FRAME.to_le_bytes());
    buf.extend_from_slice(&((BYTES_PER_SAMPLE * 8) as u16).to_le_bytes());
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&pcm_bytes.to_le_bytes());
    buf
}

pub fn needs_transcode(format: &str) -> bool {
    !crate::audio_formats::is_native_format(format)
}

pub fn is_mp4_faststart(file_path: &Path) -> bool {
    let Ok(mut f) = File::open(file_path) else {
        return false;
    };
    let mut buf = vec![0u8; MOOV_SCAN_BYTES];
    let bytes_read = match f.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return false,
    };
    let mut offset = 0usize;
    while offset + 8 <= bytes_read {
        let size = u32::from_be_bytes(
            buf[offset..offset + 4].try_into().unwrap_or([0; 4]),
        );
        let typ = std::str::from_utf8(&buf[offset + 4..offset + 8]).unwrap_or("");
        if typ == "moov" {
            return true;
        }
        if typ == "mdat" {
            return false;
        }
        let advance: u64 = if size == 0 {
            return false;
        } else if size == 1 {
            if offset + 16 > bytes_read {
                return false;
            }
            let hi = u32::from_be_bytes(
                buf[offset + 8..offset + 12].try_into().unwrap_or([0; 4]),
            ) as u64;
            let lo = u32::from_be_bytes(
                buf[offset + 12..offset + 16].try_into().unwrap_or([0; 4]),
            ) as u64;
            (hi << 32) | lo
        } else {
            size as u64
        };
        if advance < 8 {
            return false;
        }
        offset = offset.saturating_add(advance as usize);
    }
    false
}

pub fn should_transcode(format: &str, file_path: &Path) -> bool {
    let lo = format.to_ascii_lowercase();
    if lo == "m4a" || lo == "mp4" {
        return !is_mp4_faststart(file_path);
    }
    needs_transcode(&lo)
}

pub fn transcode_range(
    file_path: &Path,
    duration_s: f64,
    start: u64,
    end: u64,
) -> Result<Vec<u8>> {
    let length = (end - start + 1) as usize;
    let mut out = Vec::with_capacity(length);

    let pcm_total = pcm_bytes_for_duration(duration_s) as u32;
    let header = build_wav_header(pcm_total);
    if start < WAV_HEADER_SIZE as u64 {
        let header_end = (WAV_HEADER_SIZE as u64).min(end + 1) as usize;
        let header_start = start as usize;
        out.extend_from_slice(&header[header_start..header_end]);
    }

    let pcm_start = start.saturating_sub(WAV_HEADER_SIZE as u64);
    let pcm_end_excl = (end + 1).saturating_sub(WAV_HEADER_SIZE as u64);
    let pcm_len = pcm_end_excl.saturating_sub(pcm_start) as usize;
    if pcm_len > 0 {
        let seek_s = pcm_start as f64 / PCM_BYTES_PER_SECOND as f64;
        let dur_s = pcm_len as f64 / PCM_BYTES_PER_SECOND as f64 + 0.05;
        let mut child = Command::new(FFMPEG_PATH)
            .args(FFMPEG_QUIET)
            .args([
                "-ss",
                &format!("{:.6}", seek_s),
                "-t",
                &format!("{:.6}", dur_s),
                "-i",
                file_path.to_str().context("non-utf8 path")?,
                "-f",
                "s16le",
                "-acodec",
                "pcm_s16le",
                "-ar",
                &SAMPLE_RATE.to_string(),
                "-ac",
                &CHANNELS.to_string(),
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("spawn ffmpeg")?;
        let mut stdout = child.stdout.take().context("ffmpeg stdout missing")?;
        let mut buf = Vec::with_capacity(pcm_len);
        stdout.read_to_end(&mut buf)?;
        let _ = child.wait();
        let take = buf.len().min(pcm_len);
        out.extend_from_slice(&buf[..take]);
    }

    let needed = length.saturating_sub(out.len());
    if needed > 0 {
        out.extend(std::iter::repeat(0u8).take(needed));
    }
    Ok(out)
}

pub fn transcode_full(file_path: &Path) -> Result<Vec<u8>> {
    let mut child = Command::new(FFMPEG_PATH)
        .args(FFMPEG_QUIET)
        .args([
            "-i",
            file_path.to_str().context("non-utf8 path")?,
            "-f",
            "wav",
            "-acodec",
            "pcm_s16le",
            "-ar",
            &SAMPLE_RATE.to_string(),
            "-ac",
            &CHANNELS.to_string(),
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("spawn ffmpeg")?;
    let mut stdout = child.stdout.take().context("ffmpeg stdout missing")?;
    let mut buf = Vec::new();
    stdout.read_to_end(&mut buf)?;
    let _ = child.wait();
    Ok(buf)
}

pub fn read_file_range(path: &Path, start: u64, end: u64) -> std::io::Result<Vec<u8>> {
    let mut f = File::open(path)?;
    f.seek(SeekFrom::Start(start))?;
    let len = (end - start + 1) as usize;
    let mut buf = vec![0u8; len];
    f.read_exact(&mut buf)?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm_bytes_align_to_frames() {
        let n = pcm_bytes_for_duration(1.0);
        assert_eq!(n % BYTES_PER_FRAME as u64, 0);
        assert_eq!(n, PCM_BYTES_PER_SECOND as u64);
    }

    #[test]
    fn transcoded_size_includes_header() {
        let n = transcoded_total_size(0.0);
        assert_eq!(n, WAV_HEADER_SIZE as u64);
    }

    #[test]
    fn wav_header_is_44_bytes_and_little_endian() {
        let h = build_wav_header(0);
        assert_eq!(h.len(), WAV_HEADER_SIZE as usize);
        assert_eq!(&h[0..4], b"RIFF");
        assert_eq!(&h[8..12], b"WAVE");
        assert_eq!(&h[12..16], b"fmt ");
        assert_eq!(&h[36..40], b"data");
    }
}
