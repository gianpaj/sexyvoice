/*
  # Add stripe_id column to profiles table

  1. Changes:
    - Add stripe_id column to profiles table
*/  

alter table "public"."profiles" 
  add column "stripe_id" text;