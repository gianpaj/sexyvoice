# Project Roadmap

## Phase 1: Foundation & Authentication
- Set up Next.js project with TypeScript
- Configure Supabase (SSR) and Drizzle ORM
- Create database schema
- Create Login page
- Create Signup page
- Set up email authentication flow
- Create user profile table
- Create credits/usage tracking table

## Phase 2: Core Infrastructure
- Set up API routes structure
- Set up internationalization (i18n) system for English and Spanish
- Set up voice selection system
- Add authentication middleware (using Supabase)

## Phase 3: User Interface
- Design and implement landing page where you can create a new voice without logging in. Select a voice from a dropdown, select language and type the text you want to generate into speech (voice).
- There's a list of audio files previously generated and ranked by usage and votes.
- The main page should be under /en for English and /es for Spanish. Default to English.
- Create credit management interface and system
- Implement responsive design

## Phase 4: Database Schema and Storage Setup
- Set up Drizzle schema for users
- Create credits and usage tracking table
- Create voices table with language and privacy settings (NSFW or not)
- Create audio metadata table
- Configure Vercel Blob storage for audio files
- Set up database migrations

## Phase 5: Core Voice Features
- Implement voice selection component
- Add public/private voice toggle
- Implement voice cloning system
- Add audio generation preview functionality

## Phase 6: Audio Generation System
- Create audio generation API
- Implement credit checking and tracking system
- Set up audio file streaming
- Create audio metadata storage system
- Add audio deletion API route (storage + metadata)

## Phase 7: User Dashboard
- Create user credits dashboard
- Create audio library view
- Reuse audio playback component

---

## Phase 7: Landing Page and Marketing
- Design and implement landing page
- Add marketing content and images
- Create feature showcase section
- Add pricing section
- Implement testimonials section
- Create documentation section

## Phase 8: Polish and Optimization
- Implement error handling
- Add loading states
- Optimize database queries
- Implement proper caching
- Add input validation
- Create notification system
- Add progress indicators for generation
- Optimize audio streaming

## Phase 9: Security and Compliance
- Implement rate limiting
- Add content moderation for NSFW content
- Set up security headers
- Create privacy policy
- Add terms of service
- Implement data retention policies

## Phase 10: Testing and Deployment
- Write unit tests
- Add integration tests
- Perform security testing
- Set up CI/CD pipeline
- Create backup system
- Document deployment process



---

Create a ROADMAP.md file. Do not include weeks or dates. Just a list of tasks to be completed, split in phases.
It's for a Next.js web app. It's fun chat game with voice and text.
You can use it in single-player mode or join a chat room similar to Discord.
- Add authentication with Supabase (SSR)
- Use Drizzle as the ORM with Supabase
- Add Login and Signup pages
- Add Email Authentication only
- Add a table to keep track of usage and credits
- Add the appropriate APIs
- Add a Landing page with images
- Make it Multilingual (Spanish and English for now)
- Since bots can talk, users can choose the voice of the bot
- The voice is chosen by the user who creates the bot.
- Add a table to keep track of the bots and its voices
