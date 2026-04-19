# Overview

The Payload site is intended to function as both a content platform and an operational backend. It replaces prior CMS approaches with a unified system that supports structured content, client data, and custom workflows. The goal is not just publishing, but building a durable foundation for managing relationships, projects, and communication.

⸻

# Background: Previous Systems

## WordPress
	•	Primary use: marketing sites and content publishing
	•	Strengths:
	•	Fast to launch
	•	Large plugin ecosystem
	•	Familiar editing experience
	•	Limitations encountered:
	•	Heavy reliance on plugins (ACF, custom logic, etc.)
	•	Fragmented data model (content vs. users vs. custom tables)
	•	Difficult to evolve into a true application backend
	•	Performance overhead and maintenance burden
	•	Tight coupling between admin UI and front-end structure

## Statamic
	•	Primary use: more structured, file-based content management
	•	Strengths:
	•	Cleaner content modeling vs. WordPress
	•	Git-friendly workflow
	•	Reduced database complexity
	•	Limitations encountered:
	•	File-based system becomes brittle at scale
	•	Limited as an application backend (not suited for CRM-like logic)
	•	Friction with dynamic or relational data
	•	Admin changes not always reliably reflected in underlying files
	•	Still primarily a content tool, not an operational system

⸻

## Why Payload

Payload is positioned as a shift from “CMS as website tool” to “CMS as application core.”
	•	Schema-first design enables explicit, controlled data modeling
	•	Built-in API (REST/GraphQL) aligns with modern front-end workflows
	•	Treats content, users, and business data as part of the same system
	•	Eliminates plugin dependency in favor of custom logic
	•	Better suited for long-term evolution into a full internal tool

⸻

# Core Goals

1. Unified Content + CRM Layer
	•	Store:
	•	Pages, posts, and structured content
	•	Clients, collaborators, and relationships
	•	Projects, transactions, or commissions
	•	Replace scattered systems with a single source of truth
	•	Enable querying across content and operational data

⸻

2. Flexible Data Modeling
	•	Use collections and fields to define clear schemas
	•	Support:
	•	Relationships between entities (clients ↔ projects, etc.)
	•	Repeatable and nested structures
	•	Custom validation and logic
	•	Avoid the ambiguity of ACF-style field sprawl

⸻

3. Front-End Independence
	•	Decouple CMS from presentation layer
	•	Support:
	•	HTMX-driven interfaces
	•	Static or hybrid front-ends
	•	Custom rendering pipelines
	•	Remove constraints imposed by theme systems

⸻

4. Integrated Business Logic
	•	Move beyond content into workflows:
	•	Tracking commissions or orders
	•	Managing client interactions
	•	Handling internal states (draft, active, archived)
	•	Allow backend logic to live alongside data definitions
	•	Reduce reliance on external tools for simple operations

⸻

5. Performance and Simplicity
	•	Lean API responses tailored to actual needs
	•	Reduced overhead compared to plugin-heavy systems
	•	Fewer moving parts:
	•	No plugin updates
	•	No theme conflicts
	•	More predictable performance characteristics

⸻

6. Email Segmentation and Export
	•	Pre-segment users within Payload based on:
	•	Behavior
	•	Attributes
	•	Relationships
	•	Export clean datasets to platforms like Mailchimp
	•	Avoid duplicating segmentation logic across tools

⸻

7. Maintainability and Control
	•	Full ownership of:
	•	Schema
	•	Access control
	•	Business rules
	•	Easier debugging due to reduced abstraction layers
	•	Version-controlled configuration and structure

⸻

8. Scalability
	•	Designed to grow from:
	•	Portfolio / marketing site
	•	→ lightweight CRM
	•	→ fully integrated backend system
	•	Add features incrementally without replatforming

⸻

# Intended Outcome
	•	A single system that:
	•	Powers the website
	•	Manages client and project data
	•	Supports communication workflows
	•	Reduced cognitive load compared to juggling multiple platforms
	•	A backend that reflects how work actually happens, not just how content is published

⸻

# Open Considerations
	•	How far to extend CRM functionality vs. keeping it lightweight
	•	Degree of admin UI customization needed for usability
	•	Boundaries between Payload and external services (email, payments, etc.)
	•	Deployment and backup strategy for long-term reliability

⸻
