import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { APIError, APIErrorResponse } from '@/lib/error-ts';
import { createClient } from '@/lib/supabase/server';

const resend = new Resend(process.env.RESEND_API_KEY);

const feedbackSchema = z.object({
  text: z.string().min(1).max(5000),
  category: z.enum(['issue', 'idea']),
});

export async function POST(request: Request) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json(
        new APIErrorResponse(
          new APIError(401, 'Unauthorized', 'User not authenticated'),
        ),
        { status: 401 },
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = feedbackSchema.parse(body);

    // Get user profile with email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name, username, user_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      Sentry.captureException(profileError);
      return NextResponse.json(
        new APIErrorResponse(
          new APIError(404, 'Profile not found', 'User profile not found'),
        ),
        { status: 404 },
      );
    }

    // Insert feedback into database
    const { data: feedback, error: insertError } = await supabase
      .from('feedback')
      .insert({
        user_id: user.id,
        text: validatedData.text,
        category: validatedData.category,
        status: 'new',
      })
      .select()
      .single();

    if (insertError) {
      Sentry.captureException(insertError);
      return NextResponse.json(
        new APIErrorResponse(
          new APIError(500, 'Database error', 'Failed to save feedback'),
        ),
        { status: 500 },
      );
    }

    // Send email notification
    const supportEmailTo = process.env.SUPPORT_EMAIL_TO;
    const supportEmailFrom = process.env.SUPPORT_EMAIL_FROM;

    if (!supportEmailTo || !supportEmailFrom) {
      console.warn('Email configuration missing, skipping email notification');
    } else {
      try {
        await resend.emails.send({
          from: supportEmailFrom,
          to: supportEmailTo,
          replyTo: profile.email || user.email,
          subject: `New ${validatedData.category === 'issue' ? 'Issue' : 'Idea'} Feedback - SexyVoice.ai`,
          text: `
New Feedback Submission
=======================

Type: ${validatedData.category.charAt(0).toUpperCase() + validatedData.category.slice(1)}
Status: ${feedback.status}
Submitted: ${new Date(feedback.created_at).toLocaleString()}

User Information:
-----------------
User ID: ${user.id}
Email: ${profile.email || user.email || 'Not provided'}
Name: ${profile.full_name || profile.username || 'Not provided'}

Feedback:
---------
${validatedData.text}

---
Feedback ID: ${feedback.id}
Reply to this email to respond directly to the user.
          `.trim(),
        });
      } catch (emailError) {
        // Log the error but don't fail the request
        console.error('Failed to send email notification:', emailError);
        Sentry.captureException(emailError);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Feedback submitted successfully',
        feedbackId: feedback.id,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        new APIErrorResponse(
          new APIError(
            400,
            'Validation error',
            error.errors.map((e) => e.message).join(', '),
          ),
        ),
        { status: 400 },
      );
    }

    Sentry.captureException(error);
    console.error('Feedback submission error:', error);

    return NextResponse.json(
      new APIErrorResponse(
        new APIError(500, 'Internal server error', 'Failed to submit feedback'),
      ),
      { status: 500 },
    );
  }
}
