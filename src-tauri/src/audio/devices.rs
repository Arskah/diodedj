use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

use crate::persist::config::DeviceRef;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub description: String,
    pub is_default: bool,
}

pub fn list_output_devices() -> Vec<DeviceInfo> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let Ok(devices) = host.output_devices() else {
        return vec![];
    };

    devices
        .filter_map(|d| {
            let name = d.name().ok()?;
            let is_default = !default_name.is_empty() && name == default_name;
            Some(DeviceInfo {
                description: name.clone(),
                name,
                is_default,
            })
        })
        .collect()
}

/// Resolve a saved `DeviceRef` to a current `cpal::Device`. Exact-match by
/// name first, fall back to matching by description so a renamed device
/// (e.g. "Headphones (USB Audio)" → "Headphones (USB Audio Pro)") still
/// resolves while `description` remains stable.
pub fn resolve_device(reference: &DeviceRef) -> Option<cpal::Device> {
    let host = cpal::default_host();
    let mut found_by_name: Option<cpal::Device> = None;
    let mut found_by_desc: Option<cpal::Device> = None;
    let devices = host.output_devices().ok()?;
    for d in devices {
        let Ok(name) = d.name() else { continue };
        if name == reference.name {
            found_by_name = Some(d);
            break;
        }
        if found_by_desc.is_none() && name == reference.description {
            found_by_desc = Some(d);
        }
    }
    found_by_name.or(found_by_desc)
}

/// Resolve `main_device` config — falls back to the system default
/// device when the reference is `None` or no match exists.
pub fn resolve_main_device(reference: Option<&DeviceRef>) -> Option<cpal::Device> {
    match reference {
        None => None, // None signals "use rodio's open_default_stream"
        Some(r) => match resolve_device(r) {
            Some(d) => Some(d),
            None => {
                log::warn!(
                    "main device '{}' not found among current outputs; falling back to default",
                    r.description
                );
                None
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_devices_does_not_panic() {
        // host.output_devices() may fail or return zero devices in CI sandboxes;
        // success criterion is "no panic, returns Vec".
        let _ = list_output_devices();
    }

    #[test]
    fn resolve_unknown_device_returns_none() {
        let reference = DeviceRef {
            name: "definitely-not-a-real-device-xyz123".to_string(),
            description: "definitely-not-a-real-device-xyz123".to_string(),
        };
        assert!(resolve_device(&reference).is_none());
    }

    #[test]
    fn resolve_main_device_with_none_returns_none() {
        // None reference means "use system default" — caller passes the
        // resolved Option<Device> into rodio, which treats None as default.
        assert!(resolve_main_device(None).is_none());
    }

    #[test]
    fn resolve_main_device_with_unknown_falls_back_to_none() {
        let reference = DeviceRef {
            name: "ghost-device".to_string(),
            description: "ghost-device".to_string(),
        };
        // Unknown device → caller falls back to default (None).
        assert!(resolve_main_device(Some(&reference)).is_none());
    }
}
