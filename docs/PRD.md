# PRD.md

# photon

### Product Requirements Document (PRD)

**Version:** 1.0.0

**Status:** Draft

**Owner:** Product

**Project Type:** Offline Optical File Transfer Platform

---

# 1. Executive Summary

## Product

photon is an offline, privacy-first file sharing application that transfers digital files between two devices using only a device display and a camera.

Instead of Bluetooth, Wi-Fi Direct, NFC, cables, or cloud storage, photon converts encrypted binary packets into a continuous stream of QR codes displayed on the sender's screen. The receiver captures these QR codes using its camera, reconstructs the packets, verifies integrity, and recreates the original file exactly.

The product is designed around the photon Protocol (OSP), making the transport layer replaceable in future versions while keeping the protocol stable.

---

# 2. Vision

Build the world's most reliable offline file transfer protocol using optical communication.

---

# 3. Mission

Allow users to securely transfer files anywhere without requiring:

- Internet
- Wi-Fi
- Bluetooth
- NFC
- Mobile network
- External server

---

# 4. Product Philosophy

- Offline First
- Privacy by Default
- Reliability Over Speed
- Cross Platform
- Zero Configuration
- Protocol Driven
- Extensible Architecture

---

# 5. Problem Statement

Existing solutions depend on network infrastructure or hardware compatibility.

Examples:

- AirDrop requires Apple ecosystem.
- Nearby Share requires Bluetooth and Wi-Fi.
- Cloud storage requires Internet.
- Messaging apps compress media.
- USB cables are inconvenient.

photon eliminates these dependencies.

---

# 6. Goals

## Functional Goals

- Send any file type.
- Receive any file type.
- Preserve file integrity.
- Preserve filename.
- Preserve extension.
- Preserve metadata whenever possible.
- Resume interrupted transfers.

## Engineering Goals

- Modular protocol.
- Platform-independent logic.
- Adaptive transmission.
- Low memory usage.
- Deterministic packet handling.

## UX Goals

- Three taps to send.
- Three taps to receive.
- No technical knowledge required.

---

# 7. Success Metrics

| Metric                 | Target                        |
| ---------------------- | ----------------------------- |
| Transfer Success Rate  | >99%                          |
| Pairing Time           | <2 sec                        |
| Packet Decode Accuracy | >99.5%                        |
| File Integrity         | 100%                          |
| Crash-Free Sessions    | >99.9%                        |
| Average Throughput     | 40–80 KB/s (device dependent) |

---

# 8. User Personas

### Student

Needs to transfer notes without internet.

### Developer

Needs to send APKs and ZIP files.

### Journalist

Needs secure offline document transfer.

### Healthcare Worker

Needs offline sharing of medical reports.

### Government Employee

Works in air-gapped environments.

---

# 9. Target Platforms

### MVP

- Android

### Future

- iOS
- Desktop
- Browser Receiver

---

# 10. Supported File Types

Images

- PNG
- JPEG
- JPG
- GIF
- WebP
- HEIC

Documents

- PDF
- DOCX
- PPTX
- XLSX
- TXT

Media

- MP4
- MOV
- AVI
- MKV
- MP3
- WAV
- FLAC

Archives

- ZIP
- RAR
- 7Z

Applications

- APK

Any unknown binary file must also be supported.

---

# 11. User Journey

## Sender

Open App

↓

Tap Send

↓

Select Files

↓

Preview

↓

Generate Session

↓

Receiver Pairs

↓

Transfer Begins

↓

Verification

↓

Complete

---

## Receiver

Open App

↓

Tap Receive

↓

Scan Pairing QR

↓

Receive Packets

↓

Verification

↓

Save File

↓

Open File

---

# 12. Core Features

## File Transfer

The application SHALL transfer arbitrary binary files.

---

## Multi File Transfer

Users SHALL be able to send multiple files in one transfer.

---

## Resume

Transfers SHALL continue from the last successfully received packet.

---

## Encryption

Users MAY encrypt transfers using AES-256.

---

## Verification

Every completed transfer SHALL be verified.

---

## History

Recent transfers SHALL be stored locally.

---

# 13. Functional Requirements

## Sender

The sender SHALL:

- Pick files
- Generate manifest
- Estimate transfer duration
- Compress when beneficial
- Encrypt when enabled
- Split into packets
- Generate QR stream
- Display progress
- Pause
- Resume
- Cancel

---

## Receiver

The receiver SHALL:

- Scan pairing QR
- Detect session
- Decode packets
- Ignore duplicates
- Validate CRC
- Recover missing packets
- Verify SHA-256
- Save reconstructed file

---

# 14. Transfer Settings

## Speed

Modes:

- Auto
- Reliable
- Balanced
- Fast
- Turbo

Default:

Auto

---

## QR Size

Options

- Auto
- Small
- Medium
- Large
- Maximum

---

## Compression

Options

- Off
- Auto
- Maximum

---

## Encryption

Options

- None
- AES-128
- AES-256

---

## Verification

Options

- CRC32
- SHA-256
- SHA-512

---

## Brightness

Options

- Auto
- 50%
- 75%
- 100%

---

# 15. Developer Mode

Hidden menu containing

- Packet size
- QR version
- Error correction
- Frame duration
- Redundancy
- Protocol version
- Debug logs
- Statistics
- Benchmark

---

# 16. UI Screens

- Home
- Send
- Receive
- Pairing
- Progress
- Verification
- Completed
- History
- Settings
- Developer
- About
- Permissions

Each screen SHALL have loading, success, and error states.

---

# 17. File Manifest

Every transfer SHALL begin with a manifest containing

- Session ID
- File name
- MIME type
- File size
- Total packets
- Hash
- Compression mode
- Encryption mode

---

# 18. Protocol Requirements

The protocol SHALL

- Preserve byte order
- Preserve filename
- Preserve extension
- Detect corruption
- Ignore duplicates
- Support resume
- Support future protocol versions

---

# 19. Performance Requirements

Memory

<150 MB

Battery

<15% for a 10-minute transfer

Transfer Startup

<2 sec

Pairing

<2 sec

---

# 20. Accessibility

- Dark mode
- High contrast
- Large text
- Voice guidance
- Haptic feedback
- Color-safe indicators

---

# 21. Error Handling

| Error                    | Expected Behavior      |
| ------------------------ | ---------------------- |
| Camera Lost              | Pause                  |
| Packet Corrupted         | Discard                |
| Hash Failed              | Retry                  |
| Low Battery              | Offer Eco Mode         |
| Storage Full             | Prompt User            |
| Camera Permission Denied | Guide User to Settings |

---

# 22. Security

- Local processing only
- No cloud dependency
- No analytics by default
- Optional AES-256 encryption
- SHA-256 integrity verification
- Unique session IDs

---

# 23. Privacy

The application SHALL NOT

- Upload files
- Store files remotely
- Require an account
- Require login
- Require internet connectivity

---

# 24. Analytics

Collected locally only

- Transfer duration
- Packet loss
- Recovery count
- Average throughput
- Average FPS
- Decode success rate

No telemetry leaves the device.

---

# 25. Risks

- Camera quality
- Ambient lighting
- Motion blur
- Screen reflections
- Device overheating
- Low-end hardware
- Large files
- Battery constraints

---

# 26. MVP Scope

Included

- Single-device pairing
- Single and batch file transfer
- QR streaming
- Integrity verification
- Pause/Resume
- History
- Settings
- Adaptive speed
- Auto QR sizing

Excluded

- Desktop support
- Browser receiver
- Folder sync
- Live streaming
- Cloud backup
- Messaging

---

# 27. Future Roadmap

## v1.5

- Better adaptive optimization
- Folder transfer
- Transfer benchmarking
- Rich diagnostics

## v2

- Desktop receiver
- Browser receiver
- Multi-device broadcast
- Color optical encoding

## v3

- Optical mesh networking
- Streaming mode
- Plugin transport architecture

---

# 28. Acceptance Criteria

A release is accepted when:

- Any supported file reconstructs byte-for-byte identical to the original.
- Hash verification succeeds.
- Resume works after interruption.
- Duplicate packets do not corrupt transfers.
- Pairing completes within target latency.
- No network connectivity is required.
- No mandatory cloud service is involved.
- Crash-free rate meets reliability targets.

---

# 29. Product Principles

1. Offline before online.
2. Reliability before speed.
3. Simplicity before configuration.
4. Privacy before convenience.
5. Protocol stability before feature expansion.
6. Every file is treated as raw binary data.
7. The protocol must remain transport-agnostic so future optical encoding methods can replace QR codes without changing application behavior.

---

# 30. Definition of Done

The MVP is complete when:

- Users can transfer supported files offline using only a screen and camera.
- Reconstructed files are byte-identical to the originals.
- The application provides clear progress, verification, and recovery states.
- All mandatory functional and non-functional requirements defined in this document are satisfied.
