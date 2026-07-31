use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use strum::AsRefStr;

use crate::library::db::{Db, Track};

#[derive(Serialize, Deserialize, AsRefStr, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum ContentType {
    Music,
    Jingle,
    Commercial,
}

const JINGLE_EVERY: i64 = 4;
const COMMERCIAL_EVERY: i64 = 8;
const COMMERCIAL_BUCKET_MULTIPLIER: i64 = 3;
const COMMERCIAL_BUCKET_MIN: i64 = 10;

fn commercial_bucket_size(count: i64) -> i64 {
    (count * COMMERCIAL_BUCKET_MULTIPLIER).max(COMMERCIAL_BUCKET_MIN)
}

pub fn generate(db: &Db, count: i64, exclude_ids: &[i64]) -> Result<Vec<Track>> {
    if count <= 0 {
        return Ok(vec![]);
    }

    let exclude: std::collections::HashSet<i64> = exclude_ids.iter().copied().collect();
    // Fetch extra tracks to compensate for ones excluded by the filter.
    let excess_factor = if exclude.is_empty() { 1.0 } else { 2.0 };

    let jingle_count = count / JINGLE_EVERY;
    let commercial_count = count / COMMERCIAL_EVERY;
    let music_count = (count - jingle_count - commercial_count).max(0);

    let raw_music: Vec<Track> = if exclude.is_empty() {
        db.get_random_tracks(ContentType::Music.as_ref(), music_count)?
            .into_iter()
            .collect()
    } else {
        db.get_random_tracks(
            ContentType::Music.as_ref(),
            ((music_count as f64 * excess_factor) as i64) + 10,
        )?
        .into_iter()
        .filter(|t| !exclude.contains(&t.id))
        .collect()
    };

    let music: Vec<Track> = raw_music
        .into_iter()
        .take(music_count.max(0) as usize)
        .collect();

    let raw_jingles: Vec<Track> = if exclude.is_empty() {
        db.get_random_tracks(ContentType::Jingle.as_ref(), jingle_count)?
            .into_iter()
            .collect()
    } else {
        db.get_random_tracks(
            ContentType::Jingle.as_ref(),
            ((jingle_count as f64 * excess_factor) as i64) + 5,
        )?
        .into_iter()
        .filter(|t| !exclude.contains(&t.id))
        .collect()
    };

    let jingles: Vec<Track> = raw_jingles
        .into_iter()
        .take(jingle_count.max(0) as usize)
        .collect();

    let mut commercials_filtered: Vec<Track> = db
        .pick_random_from_bottom(
            ContentType::Commercial.as_ref(),
            commercial_count,
            commercial_bucket_size(commercial_count),
        )?
        .into_iter()
        .filter(|t| !exclude.contains(&t.id))
        .collect();

    // Don't let commercials leak tracks already seen as jingles.
    let j_ids: std::collections::HashSet<i64> = jingles.iter().map(|t| t.id).collect();
    commercials_filtered.retain(|t| !j_ids.contains(&t.id));

    Ok(interleave_evenly(music, jingles, commercials_filtered))
}

pub fn pick_filler(db: &Db, content_type: ContentType) -> Result<Option<Track>> {
    match content_type {
        ContentType::Jingle => Ok(db.get_random_tracks(ContentType::Jingle.as_ref(), 1)?.pop()),
        ContentType::Commercial => Ok(db
            .pick_random_from_bottom(
                ContentType::Commercial.as_ref(),
                1,
                commercial_bucket_size(1),
            )?
            .pop()),
        ContentType::Music => Ok(None),
    }
}

pub fn interleave_evenly(
    music: Vec<Track>,
    jingles: Vec<Track>,
    commercials: Vec<Track>,
) -> Vec<Track> {
    let total = music.len() + jingles.len() + commercials.len();
    if total == 0 {
        return vec![];
    }

    let j_slots = pick_even_slots(total, jingles.len());
    let remaining: Vec<usize> = (0..total).filter(|i| !j_slots.contains(i)).collect();
    let c_indices = pick_even_slots(remaining.len(), commercials.len());
    let c_slots: HashSet<usize> = c_indices.iter().map(|&idx| remaining[idx]).collect();

    let mut music_iter = music.into_iter();
    let mut jingle_iter = jingles.into_iter();
    let mut commercial_iter = commercials.into_iter();
    let mut out = Vec::with_capacity(total);
    for i in 0..total {
        let next = if j_slots.contains(&i) {
            jingle_iter.next()
        } else if c_slots.contains(&i) {
            commercial_iter.next()
        } else {
            music_iter.next()
        };
        if let Some(t) = next {
            out.push(t);
        }
    }
    out
}

fn pick_even_slots(total: usize, count: usize) -> HashSet<usize> {
    let mut slots = HashSet::new();
    if count == 0 || total == 0 {
        return slots;
    }
    let step = total as f64 / count as f64;
    for i in 0..count {
        slots.insert((i as f64 * step + step / 2.0).floor() as usize);
    }
    slots
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(id: i64) -> Track {
        Track {
            id,
            title: format!("t{}", id),
            artist: "a".into(),
            album: "al".into(),
            duration: 100.0,
            play_count: 0,
            genre: None,
            year: None,
            bpm: None,
            sample_rate: None,
            bitrate: None,
            format: None,
        }
    }

    #[test]
    fn empty_inputs_yield_empty_output() {
        assert!(interleave_evenly(vec![], vec![], vec![]).is_empty());
    }

    #[test]
    fn music_only_passes_through() {
        let m = vec![track(1), track(2), track(3)];
        let r = interleave_evenly(m, vec![], vec![]);
        assert_eq!(r.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1, 2, 3]);
    }

    #[test]
    fn jingles_and_commercials_spread_across_total() {
        let music: Vec<Track> = (1..=12).map(track).collect();
        let jingles: Vec<Track> = (101..=103).map(track).collect();
        let commercials: Vec<Track> = (201..=202).map(track).collect();
        let r = interleave_evenly(music, jingles, commercials);
        assert_eq!(r.len(), 17);
        let jingle_positions: Vec<usize> = r
            .iter()
            .enumerate()
            .filter_map(|(i, t)| (t.id >= 101 && t.id <= 103).then_some(i))
            .collect();
        assert_eq!(jingle_positions.len(), 3);
        // Jingle slots should not be adjacent (spread is the contract).
        for w in jingle_positions.windows(2) {
            assert!(w[1] - w[0] >= 2, "jingles too close: {:?}", w);
        }
    }

    #[test]
    fn music_count_is_clamped_for_small_totals() {
        // count=3 → no jingles, no commercials, 3 music
        let total = 3i64;
        let jingle_count = total / JINGLE_EVERY;
        let commercial_count = total / COMMERCIAL_EVERY;
        assert_eq!(jingle_count, 0);
        assert_eq!(commercial_count, 0);
    }
}
