# 09_UI_SPEC.md

# User Interface Specification

**Document Version:** 1.0

**Status:** Draft

**Related Documents**

- 01_PRD.md
- 02_TRD.md
- 03_ARCHITECTURE.md

---

# 1. Purpose

This document defines the complete user interface of the photon application.

It specifies:

- Screen hierarchy
- Navigation
- UI components
- User interactions
- States
- Animations
- Accessibility
- Design system
- Responsive behavior

This document intentionally excludes protocol behavior and implementation details.

---

# 2. Design Principles

The photon interface SHALL follow these principles:

- Offline-first
- Minimal interaction
- Fast task completion
- Large touch targets
- Accessibility
- Predictable navigation
- Platform consistency

---

# 3. Information Architecture

```text
photon

├── Home
│
├── Send
│
├── Receive
│
├── Transfer
│
├── History
│
├── Settings
│
└── About
```

---

# 4. Navigation

Primary navigation consists of:

- Home
- Send
- Receive
- History
- Settings

Transfer Progress SHALL open as a full-screen flow.

---

# 5. Screen Specifications

## 5.1 Home

Purpose

Entry point into the application.

Primary Actions

- Send Files
- Receive Files
- View History
- Open Settings

Components

- Header
- Hero Actions
- Recent Transfers
- Status Indicator

---

## 5.2 Send

Purpose

Select files and configure a transfer.

Components

- File Picker
- Selected Files List
- QR Speed Slider
- Encryption Toggle
- Compression Toggle
- Start Transfer Button

---

## 5.3 Receive

Purpose

Capture QR frames and reconstruct files.

Components

- Camera Preview
- Scan Overlay
- Progress Indicator
- Missing Packet Counter
- Transfer Status

---

## 5.4 Transfer Progress

Purpose

Monitor an active transfer.

Components

- Progress Ring
- Packet Counter
- Throughput
- Estimated Time
- Pause Button
- Cancel Button

---

## 5.5 History

Purpose

Display previous transfers.

Components

- Search
- Filter
- Transfer List
- Details Sheet

---

## 5.6 Settings

Purpose

Configure application preferences.

Sections

- Appearance
- QR Settings
- Camera
- Storage
- Security
- Developer

---

## 5.7 About

Purpose

Display application information.

Components

- Version
- Protocol Version
- Licenses
- Credits

---

# 6. Shared Components

Reusable components include:

- Primary Button
- Secondary Button
- Icon Button
- Card
- Progress Ring
- Progress Bar
- List Item
- Modal
- Bottom Sheet
- Snackbar
- Toast
- Dialog

Every reusable component SHALL be stateless where practical.

---

# 7. Screen States

Every screen SHALL define:

- Initial
- Loading
- Empty
- Success
- Error
- Disabled

Example

```text
Loading

↓

Ready

↓

Error
```

---

# 8. User Interaction

Supported interactions:

- Tap
- Long Press
- Swipe
- Scroll
- Pinch (future)

The application SHALL remain fully usable using one-handed interaction.

---

# 9. Visual Feedback

The application SHALL provide feedback for:

- Button presses
- Transfer progress
- Errors
- Success
- Camera status
- QR generation

Feedback SHALL be immediate.

---

# 10. Accessibility

The UI SHOULD support:

- Screen readers
- Dynamic text size
- High contrast
- Reduced motion
- Color-blind friendly indicators
- Large touch targets

Accessibility SHALL not change application behavior.

---

# 11. Responsive Design

The interface SHALL adapt to:

- Phones
- Tablets
- Foldables (future)

Layout adjustments SHALL preserve navigation consistency.

---

# 12. Theme

Supported themes:

- Light
- Dark
- System

Brand colors, typography, spacing, and iconography SHALL be defined in the design system.

---

# 13. Animations

Animations SHOULD be:

- Smooth
- Short
- Functional

Examples:

- Screen transitions
- Progress updates
- Bottom sheets
- Success indicators

Animations SHALL never delay protocol execution.

---

# 14. Error UX

Errors SHALL include:

- Clear title
- Human-readable explanation
- Recovery action

Example:

```text
Camera Access Required

Allow camera permission to receive files.

[Grant Permission]
```

---

# 15. Empty States

Every screen SHALL define an empty state.

Example:

History

```text
No transfers yet.

Your completed transfers will appear here.
```

---

# 16. Loading States

Loading indicators SHALL be shown for:

- Camera initialization
- File loading
- QR generation
- Reconstruction
- File saving

---

# 17. Design Tokens

The design system SHALL define:

- Colors
- Typography
- Spacing
- Radius
- Shadows
- Icon sizes
- Animation durations

Implementation details MAY be stored separately.

---

# 18. UI Invariants

Every UI implementation SHALL satisfy the following invariants:

1. Every screen SHALL have a clearly defined purpose.
2. Navigation SHALL remain predictable.
3. User actions SHALL produce immediate feedback.
4. UI SHALL remain independent of protocol logic.
5. Shared components SHALL be reusable.
6. Accessibility SHALL be considered throughout the application.
7. Screen states SHALL be explicitly defined.
8. Visual design SHALL remain consistent.
9. Responsive behavior SHALL preserve usability.
10. The UI SHALL remain replaceable without affecting protocol behavior.

This document defines the canonical user interface specification for photon Version 1.x.
