# Claude Code Documentation

This document provides technical documentation for developers working on SexyVoice.ai, particularly for those using Claude Code or similar AI development tools.

## Feedback System

### Overview

The feedback system allows authenticated users to submit ideas and report issues directly from the dashboard. The system includes:

- User-facing feedback dialog in the dashboard header
- Dual-category system (Issues vs Ideas)
- Integration with Crisp chat for technical support
- Email notifications to the support team via Resend
- Database storage for feedback tracking and management

### Architecture

#### Frontend Components

**FeedbackDialog Component** (`components/feedback-dialog.tsx`)
- Client-side component with modal dialog interface
- Two-step flow:
  1. Category selection (Issue or Idea)
  2. Text input for ideas (Issues redirect to Crisp)
- Real-time validation and error handling
- Toast notifications for user feedback

**Dashboard Integration** (`app/[lang]/(dashboard)/dashboard.ui.tsx`)
- Non-sticky header with Feedback button
- Visible across all dashboard pages
- Responsive design with mobile optimization

#### Backend API

**POST /api/feedback** (`app/api/feedback/route.ts`)
- Authentication required via Supabase auth
- Request validation using Zod schema
- Database insertion with automatic timestamps
- Email notification via Resend
- Comprehensive error handling and logging

#### Database Schema

**feedback table** (`supabase/migrations/20251101000000_create_feedback_table.sql`)
```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('issue', 'idea')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);
```

**Indexes:**
- `idx_feedback_user_id` - For user-specific queries
- `idx_feedback_status` - For filtering by status
- `idx_feedback_created_at` - For chronological sorting

**RLS Policies:**
- Users can insert their own feedback
- Users can view their own feedback
- Admins have full access (to be implemented)

### Email Integration

**Resend Configuration**

The feedback system uses Resend for email notifications. Setup requires:

1. **API Key**: Obtain from [Resend Dashboard](https://resend.com/dashboard)
2. **Domain Verification**: Verify your sending domain in Resend
3. **Environment Variables**:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   SUPPORT_EMAIL_TO=support@example.com
   SUPPORT_EMAIL_FROM=noreply@example.com
   ```

**Email Template**

Emails include:
- Feedback type (Issue/Idea)
- Submission timestamp
- User information (ID, email, name)
- Full feedback text
- Unique feedback ID for tracking
- Reply-to header set to user's email for direct responses

### Internationalization

Feedback system translations are available in:
- English (`lib/i18n/dictionaries/en.json`)
- Spanish (`lib/i18n/dictionaries/es.json`)
- German (`lib/i18n/dictionaries/de.json`)

Translation keys under `feedback` namespace:
- `title`, `description`
- `issueButton.title`, `issueButton.description`
- `ideaButton.title`, `ideaButton.description`
- `textareaPlaceholder`, `sendButton`, `backButton`
- `submitting`, `success`
- `technicalIssueText`, `supportLinkText`
- `errors.emptyText`, `errors.submitFailed`

### Usage Examples

#### Submitting Feedback (Frontend)

```typescript
const response = await fetch('/api/feedback', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'My feedback text here',
    category: 'idea', // or 'issue'
  }),
});

const data = await response.json();
// Returns: { success: true, message: '...', feedbackId: 'uuid' }
```

#### Querying Feedback (Backend)

```typescript
// Get all feedback for a user
const { data: userFeedback } = await supabase
  .from('feedback')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });

// Update feedback status
const { data } = await supabase
  .from('feedback')
  .update({ status: 'in_progress' })
  .eq('id', feedbackId);
```

### Security Considerations

1. **Authentication**: All feedback submissions require valid Supabase authentication
2. **Authorization**: RLS policies ensure users can only access their own feedback
3. **Validation**: Zod schema validates input before processing
4. **Rate Limiting**: Consider implementing rate limiting on the API endpoint (future enhancement)
5. **XSS Prevention**: All user input is sanitized before display
6. **Email Security**: Reply-to headers allow direct responses without exposing system email

### Future Enhancements

- Admin dashboard for managing feedback
- Feedback voting and prioritization
- Status update notifications to users
- Integration with project management tools (Linear, GitHub Issues)
- AI-powered feedback categorization and sentiment analysis
- Public roadmap integration

### Testing

#### Manual Testing Checklist

- [ ] Feedback button visible in dashboard header
- [ ] Issue button opens Crisp chat
- [ ] Idea submission saves to database
- [ ] Email notification sent to support team
- [ ] User receives success toast notification
- [ ] Form validation works correctly
- [ ] Error handling displays appropriate messages
- [ ] Translations work in all supported languages

#### Database Testing

```sql
-- Verify feedback was created
SELECT * FROM feedback WHERE user_id = 'user-uuid' ORDER BY created_at DESC LIMIT 1;

-- Check RLS policies
SELECT * FROM feedback; -- Should only return current user's feedback

-- Verify indexes
EXPLAIN ANALYZE SELECT * FROM feedback WHERE user_id = 'uuid' AND status = 'new';
```

## Development Workflow

### Adding New Features

1. Create feature branch from main
2. Implement changes with tests
3. Update translations for all supported languages
4. Update documentation (README.md, CLAUDE.md)
5. Create pull request with detailed description
6. Ensure CI/CD passes (linting, type checking, tests)
7. Request code review
8. Merge after approval

### Database Migrations

1. Create migration file: `supabase/migrations/YYYYMMDDHHmmss_description.sql`
2. Test locally with `supabase db reset`
3. Verify RLS policies
4. Generate TypeScript types: `pnpm run generate-supabase-types`
5. Commit migration file

### Code Style

- Use Biome for linting and formatting
- Follow TypeScript strict mode
- Prefer server components where possible
- Use Zod for runtime validation
- Document complex logic with comments
- Write descriptive commit messages

## Troubleshooting

### Common Issues

**Resend Email Not Sending**
- Verify API key is correct
- Check domain verification status
- Ensure FROM email is verified
- Review Resend dashboard logs

**Feedback Not Saving**
- Check Supabase connection
- Verify user authentication
- Review RLS policies
- Check migration status

**TypeScript Errors**
- Regenerate Supabase types
- Clear `.next` cache
- Restart TypeScript server

### Debugging

Enable verbose logging:
```bash
DEBUG=* pnpm dev
```

Check Supabase logs:
```bash
supabase logs --tail
```

Monitor Sentry for errors:
- Visit Sentry dashboard
- Filter by environment and time range
- Review error stack traces

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Resend Documentation](https://resend.com/docs)
- [Radix UI Components](https://radix-ui.com/primitives/docs/overview/introduction)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
