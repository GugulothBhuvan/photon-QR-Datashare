# TASK_GRAPH.md

# photon Task Graph

**Version:** 1.0

---

# 1. Purpose

This document models the photon project as a Directed Acyclic Graph (DAG).

Each node represents a discrete implementation task.

Edges represent prerequisite relationships.

Tasks may execute in parallel whenever dependencies permit.

---

# 2. Task ID Convention

| Prefix | Module         |
| ------ | -------------- |
| SET    | Setup          |
| ARC    | Architecture   |
| MOD    | Models         |
| PKT    | Packet         |
| PRO    | Protocol       |
| QR     | QR Engine      |
| CAM    | Camera         |
| REC    | Reconstruction |
| UI     | User Interface |
| TST    | Testing        |
| SEC    | Security       |
| REL    | Release        |

---

# 3. High-Level Dependency Graph

SET
↓

ARC
↓

MOD
↓

PKT
↓

PRO
↓

QR
↓

CAM
↓

REC
↓

UI
↓

TST
↓

SEC
↓

REL

---

# 4. Task Breakdown

## Setup

SET-001 Initialize Expo

↓

SET-002 Configure TypeScript

↓

SET-003 Configure CI

↓

SET-004 Create Folder Structure

---

## Architecture

ARC-001 Dependency Injection

↓

ARC-002 Event Bus

↓

ARC-003 Repository Layer

↓

ARC-004 State Management

↓

ARC-005 Configuration

---

## Models

MOD-001 Session

↓

MOD-002 Packet

↓

MOD-003 Manifest

↓

MOD-004 Transfer

↓

MOD-005 Settings

---

## Packet Layer

PKT-001 Packet Header

↓

PKT-002 Packet Footer

↓

PKT-003 Serializer

↓

PKT-004 Deserializer

↓

PKT-005 Validator

---

## Protocol

PRO-001 Session Manager

↓

PRO-002 Manifest Manager

↓

PRO-003 Packet Manager

↓

PRO-004 Resume

↓

PRO-005 Recovery

---

## QR

QR-001 Generator

↓

QR-002 Renderer

↓

QR-003 Scheduler

↓

QR-004 Benchmark

---

## Camera

CAM-001 Camera Module

↓

CAM-002 Frame Processor

↓

CAM-003 QR Detection

↓

CAM-004 QR Decoder

---

## Reconstruction

REC-001 Repository

↓

REC-002 Packet Ordering

↓

REC-003 Missing Packet Recovery

↓

REC-004 File Builder

↓

REC-005 Integrity Check

---

## User Interface

UI-001 Navigation

↓

UI-002 Home

↓

UI-003 Send

↓

UI-004 Receive

↓

UI-005 Progress

↓

UI-006 History

↓

UI-007 Settings

---

## Testing

TST-001 Unit Tests

↓

TST-002 Integration Tests

↓

TST-003 End-to-End Tests

↓

TST-004 Performance Tests

---

## Security

SEC-001 Encryption

↓

SEC-002 Secure Storage

↓

SEC-003 SHA-256

↓

SEC-004 Validation

---

## Release

REL-001 Documentation

↓

REL-002 Production Build

↓

REL-003 Version Tag

↓

REL-004 Publish

---

# 5. Critical Path

SET
↓

ARC
↓

MOD
↓

PKT
↓

PRO
↓

QR
↓

CAM
↓

REC
↓

UI
↓

TST
↓

SEC
↓

REL

---

# 6. Parallel Execution Opportunities

The following tasks may be developed concurrently after prerequisites are met:

- ARC-003 Repository Layer and ARC-004 State Management
- MOD-002 Packet and MOD-003 Manifest
- QR-001 Generator and CAM-001 Camera Module
- UI-002 Home and UI-007 Settings
- TST-001 Unit Tests alongside feature implementation
- SEC-001 Encryption and SEC-002 Secure Storage

---

# 7. Node Metadata Template

Every task SHOULD define:

- Task ID
- Name
- Description
- Inputs
- Outputs
- Dependencies
- Estimated Effort
- Owner
- Status
- Acceptance Criteria

Example:

Task ID: PKT-003
Name: Packet Serializer
Depends On: PKT-001, PKT-002
Produces: Uint8Array
Status: Not Started
Acceptance: Round-trip serialization passes all test vectors.
