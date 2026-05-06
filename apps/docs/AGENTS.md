# SexyVoice.ai Documentation

Documentation for [SexyVoice.ai](https://sexyvoice.ai) - AI-powered voice generation platform.

**Live docs:** [docs.sexyvoice.ai](https://docs.sexyvoice.ai)

## Product Overview

SexyVoice.ai has three main features:

1. **Generate (Text-to-Speech)** - Convert text into natural-sounding speech
2. **Voice Cloning** - Create custom voice models from audio samples
3. **Voice Call (Real-time Voice)** - Live voice interaction capabilities

## Source Code Reference

- Web app: `apps/web`
- Docs: `apps/docs`

## Working Relationship

- You can push back on ideas-this can lead to better documentation. Cite sources and explain your reasoning when you do so
- ALWAYS ask for clarification rather than making assumptions
- NEVER lie, guess, or make up information

## Project Context

- Format: MDX files with YAML frontmatter
- Config: docs.json for navigation, theme, settings
- Components: Mintlify components

## Content Strategy

- Document just enough for user success - not too much, not too little
- Prioritize accuracy and usability of information
- Make content evergreen when possible
- Search for existing information before adding new content. Avoid duplication unless it is done for a strategic reason
- Check existing patterns for consistency
- Start by making the smallest reasonable changes

## Frontmatter Requirements For Pages

- title: Clear, descriptive page title
- description: Concise summary for SEO/navigation

## Writing Standards

- Second-person voice ("you")
- Prerequisites at start of procedural content
- Test all code examples before publishing
- Match style and formatting of existing pages
- Include both basic and advanced use cases
- Language tags on all code blocks
- Alt text on all images
- Relative paths for internal links

## Git Workflow

- NEVER use `--no-verify` when committing
- Ask how to handle uncommitted changes before starting
- Create a new branch when no clear branch exists for changes
- Commit frequently throughout development
- NEVER skip or disable pre-commit hooks

## Do Not

- Skip frontmatter on any MDX file
- Use absolute URLs for internal links
- Include untested code examples
- Make assumptions - always ask for clarification
