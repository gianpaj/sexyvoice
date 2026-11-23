/** biome-ignore-all lint/style/useConsistentTypeDefinitions: generated Supabase types use type aliases */
declare type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

declare type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      account_conversation_erasures: {
        Row: {
          blocked_until: string;
          user_id: string;
        };
        Insert: {
          blocked_until?: string;
          user_id: string;
        };
        Update: {
          blocked_until?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      agent_memories: {
        Row: {
          character_id: string;
          content: string;
          created_at: string;
          embedding: string | null;
          fts: unknown;
          id: number;
          memory_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          character_id?: string;
          content: string;
          created_at?: string;
          embedding?: string | null;
          fts?: unknown;
          id?: never;
          memory_type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          character_id?: string;
          content?: string;
          created_at?: string;
          embedding?: string | null;
          fts?: unknown;
          id?: never;
          memory_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          metadata: Json;
          name: string;
          permissions: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          metadata?: Json;
          name: string;
          permissions?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          metadata?: Json;
          name?: string;
          permissions?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      audio_files: {
        Row: {
          created_at: string | null;
          credits_used: number;
          deleted_at: string | null;
          duration: number;
          id: string;
          is_public: boolean;
          model: string;
          prediction_id: string | null;
          status: string;
          storage_key: string;
          text_content: string;
          total_votes: number;
          url: string;
          usage: Json | null;
          user_id: string | null;
          voice_id: string;
        };
        Insert: {
          created_at?: string | null;
          credits_used?: number;
          deleted_at?: string | null;
          duration: number;
          id?: string;
          is_public?: boolean;
          model: string;
          prediction_id?: string | null;
          status?: string;
          storage_key: string;
          text_content: string;
          total_votes?: number;
          url: string;
          usage?: Json | null;
          user_id?: string | null;
          voice_id: string;
        };
        Update: {
          created_at?: string | null;
          credits_used?: number;
          deleted_at?: string | null;
          duration?: number;
          id?: string;
          is_public?: boolean;
          model?: string;
          prediction_id?: string | null;
          status?: string;
          storage_key?: string;
          text_content?: string;
          total_votes?: number;
          url?: string;
          usage?: Json | null;
          user_id?: string | null;
          voice_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audio_files_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audio_files_voice_id_fkey';
            columns: ['voice_id'];
            isOneToOne: false;
            referencedRelation: 'voices';
            referencedColumns: ['id'];
          },
        ];
      };
      audio_references: {
        Row: {
          created_at: string | null;
          id: string;
          is_paid: boolean;
          locale: string | null;
          name: string;
          provider: string;
          sample_url: string | null;
          updated_at: string | null;
          user_id: string;
          voice_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_paid?: boolean;
          locale?: string | null;
          name: string;
          provider: string;
          sample_url?: string | null;
          updated_at?: string | null;
          user_id: string;
          voice_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_paid?: boolean;
          locale?: string | null;
          name?: string;
          provider?: string;
          sample_url?: string | null;
          updated_at?: string | null;
          user_id?: string;
          voice_id?: string;
        };
        Relationships: [];
      };
      call_analysis_queue: {
        Row: {
          attempts: number;
          completed_at: string | null;
          last_error: string | null;
          queued_at: string;
          session_id: string;
          status: string;
          submitted_at: string | null;
          updated_at: string;
          xai_batch_id: string | null;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          last_error?: string | null;
          queued_at?: string;
          session_id: string;
          status?: string;
          submitted_at?: string | null;
          updated_at?: string;
          xai_batch_id?: string | null;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          last_error?: string | null;
          queued_at?: string;
          session_id?: string;
          status?: string;
          submitted_at?: string | null;
          updated_at?: string;
          xai_batch_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'call_analysis_queue_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'call_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      call_session_analysis: {
        Row: {
          ai_issues: string | null;
          analyzed_at: string | null;
          conversation_quality: string | null;
          created_at: string | null;
          duration_seconds: number | null;
          end_reason: string | null;
          engagement_level: string | null;
          error: string | null;
          id: string;
          key_requests: Json | null;
          language: string | null;
          notable_patterns: string | null;
          session_id: string;
          started_at: string | null;
          topic_category: string | null;
          topic_subcategory: string | null;
          user_id: string | null;
          user_sentiment: string | null;
          where_died: string | null;
        };
        Insert: {
          ai_issues?: string | null;
          analyzed_at?: string | null;
          conversation_quality?: string | null;
          created_at?: string | null;
          duration_seconds?: number | null;
          end_reason?: string | null;
          engagement_level?: string | null;
          error?: string | null;
          id?: string;
          key_requests?: Json | null;
          language?: string | null;
          notable_patterns?: string | null;
          session_id: string;
          started_at?: string | null;
          topic_category?: string | null;
          topic_subcategory?: string | null;
          user_id?: string | null;
          user_sentiment?: string | null;
          where_died?: string | null;
        };
        Update: {
          ai_issues?: string | null;
          analyzed_at?: string | null;
          conversation_quality?: string | null;
          created_at?: string | null;
          duration_seconds?: number | null;
          end_reason?: string | null;
          engagement_level?: string | null;
          error?: string | null;
          id?: string;
          key_requests?: Json | null;
          language?: string | null;
          notable_patterns?: string | null;
          session_id?: string;
          started_at?: string | null;
          topic_category?: string | null;
          topic_subcategory?: string | null;
          user_id?: string | null;
          user_sentiment?: string | null;
          where_died?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'call_session_analysis_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'call_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      call_session_analytics: {
        Row: {
          analysis_date: string;
          created_at: string | null;
          id: string;
          insights: Json;
          time_range_hours: number;
          total_sessions_analyzed: number;
        };
        Insert: {
          analysis_date?: string;
          created_at?: string | null;
          id?: string;
          insights: Json;
          time_range_hours: number;
          total_sessions_analyzed: number;
        };
        Update: {
          analysis_date?: string;
          created_at?: string | null;
          id?: string;
          insights?: Json;
          time_range_hours?: number;
          total_sessions_analyzed?: number;
        };
        Relationships: [];
      };
      call_sessions: {
        Row: {
          billed_minutes: number;
          conversation_id: string | null;
          created_at: string | null;
          credits_used: number;
          duration_seconds: number;
          end_reason: string | null;
          ended_at: string | null;
          free_call: boolean | null;
          id: string;
          last_metered_at: string;
          max_output_tokens: number | null;
          metadata: Json | null;
          model: string;
          started_at: string;
          status: string;
          transcript: Json | null;
          updated_at: string | null;
          user_id: string;
          voice_id: string;
        };
        Insert: {
          billed_minutes?: number;
          conversation_id?: string | null;
          created_at?: string | null;
          credits_used?: number;
          duration_seconds?: number;
          end_reason?: string | null;
          ended_at?: string | null;
          free_call?: boolean | null;
          id?: string;
          last_metered_at?: string;
          max_output_tokens?: number | null;
          metadata?: Json | null;
          model: string;
          started_at?: string;
          status?: string;
          transcript?: Json | null;
          updated_at?: string | null;
          user_id: string;
          voice_id: string;
        };
        Update: {
          billed_minutes?: number;
          conversation_id?: string | null;
          created_at?: string | null;
          credits_used?: number;
          duration_seconds?: number;
          end_reason?: string | null;
          ended_at?: string | null;
          free_call?: boolean | null;
          id?: string;
          last_metered_at?: string;
          max_output_tokens?: number | null;
          metadata?: Json | null;
          model?: string;
          started_at?: string;
          status?: string;
          transcript?: Json | null;
          updated_at?: string | null;
          user_id?: string;
          voice_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'call_sessions_conversation_owner_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'call_sessions_voice_id_fkey';
            columns: ['voice_id'];
            isOneToOne: false;
            referencedRelation: 'voices';
            referencedColumns: ['id'];
          },
        ];
      };
      characters: {
        Row: {
          created_at: string | null;
          id: string;
          image: string | null;
          is_public: boolean;
          localized_descriptions: Json | null;
          localized_sample_urls: Json | null;
          name: string;
          prompt_id: string;
          session_config: Json;
          sort_order: number;
          updated_at: string | null;
          user_id: string;
          voice_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          image?: string | null;
          is_public?: boolean;
          localized_descriptions?: Json | null;
          localized_sample_urls?: Json | null;
          name: string;
          prompt_id: string;
          session_config?: Json;
          sort_order?: number;
          updated_at?: string | null;
          user_id: string;
          voice_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          image?: string | null;
          is_public?: boolean;
          localized_descriptions?: Json | null;
          localized_sample_urls?: Json | null;
          name?: string;
          prompt_id?: string;
          session_config?: Json;
          sort_order?: number;
          updated_at?: string | null;
          user_id?: string;
          voice_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'characters_prompt_id_fkey';
            columns: ['prompt_id'];
            isOneToOne: false;
            referencedRelation: 'prompts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'characters_voice_id_fkey';
            columns: ['voice_id'];
            isOneToOne: false;
            referencedRelation: 'voices';
            referencedColumns: ['id'];
          },
        ];
      };
      cli_login_sessions: {
        Row: {
          callback_url: string;
          created_at: string;
          encrypted_api_key: string | null;
          expires_at: string;
          id: string;
          new_api_key_id: string;
          old_api_key_id: string | null;
          redeemed_at: string | null;
          state: string;
          token_hash: string;
          user_id: string;
        };
        Insert: {
          callback_url: string;
          created_at?: string;
          encrypted_api_key?: string | null;
          expires_at: string;
          id?: string;
          new_api_key_id: string;
          old_api_key_id?: string | null;
          redeemed_at?: string | null;
          state: string;
          token_hash: string;
          user_id: string;
        };
        Update: {
          callback_url?: string;
          created_at?: string;
          encrypted_api_key?: string | null;
          expires_at?: string;
          id?: string;
          new_api_key_id?: string;
          old_api_key_id?: string | null;
          redeemed_at?: string | null;
          state?: string;
          token_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cli_login_sessions_new_api_key_id_fkey';
            columns: ['new_api_key_id'];
            isOneToOne: false;
            referencedRelation: 'api_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cli_login_sessions_old_api_key_id_fkey';
            columns: ['old_api_key_id'];
            isOneToOne: false;
            referencedRelation: 'api_keys';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_messages: {
        Row: {
          call_session_id: string | null;
          conversation_id: string;
          created_at: string;
          id: string;
          parts: Json;
          position: number;
          revision: number;
          role: string;
          source: string;
          source_item_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          call_session_id?: string | null;
          conversation_id: string;
          created_at?: string;
          id: string;
          parts?: Json;
          position: number;
          revision?: number;
          role: string;
          source: string;
          source_item_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          call_session_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          parts?: Json;
          position?: number;
          revision?: number;
          role?: string;
          source?: string;
          source_item_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_messages_call_fkey';
            columns: ['call_session_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'call_sessions';
            referencedColumns: ['id', 'conversation_id'];
          },
          {
            foreignKeyName: 'conversation_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          character_id: string | null;
          character_name: string;
          created_at: string;
          id: string;
          language: string;
          revision: number;
          scene_id: string | null;
          scene_instructions: string;
          updated_at: string;
          user_id: string;
          uses_default_character: boolean;
        };
        Insert: {
          character_id?: string | null;
          character_name: string;
          created_at?: string;
          id?: string;
          language: string;
          revision?: number;
          scene_id?: string | null;
          scene_instructions?: string;
          updated_at?: string;
          user_id: string;
          uses_default_character?: boolean;
        };
        Update: {
          character_id?: string | null;
          character_name?: string;
          created_at?: string;
          id?: string;
          language?: string;
          revision?: number;
          scene_id?: string | null;
          scene_instructions?: string;
          updated_at?: string;
          user_id?: string;
          uses_default_character?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_character_id_fkey';
            columns: ['character_id'];
            isOneToOne: false;
            referencedRelation: 'characters';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_transactions: {
        Row: {
          amount: number;
          created_at: string;
          description: string;
          id: string;
          metadata: Json | null;
          reference_id: string | null;
          subscription_id: string | null;
          type: Database['public']['Enums']['credit_transaction_type'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          description: string;
          id?: string;
          metadata?: Json | null;
          reference_id?: string | null;
          subscription_id?: string | null;
          type: Database['public']['Enums']['credit_transaction_type'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          description?: string;
          id?: string;
          metadata?: Json | null;
          reference_id?: string | null;
          subscription_id?: string | null;
          type?: Database['public']['Enums']['credit_transaction_type'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_transactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      credits: {
        Row: {
          amount: number;
          created_at: string | null;
          id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          amount?: number;
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credits_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          id: string;
          stripe_id: string | null;
          updated_at: string | null;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          id: string;
          stripe_id?: string | null;
          updated_at?: string | null;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          id?: string;
          stripe_id?: string | null;
          updated_at?: string | null;
          username?: string;
        };
        Relationships: [];
      };
      prompts: {
        Row: {
          created_at: string | null;
          id: string;
          is_public: boolean;
          localized_prompts: Json | null;
          prompt: string;
          type: Database['public']['Enums']['feature_type'];
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_public?: boolean;
          localized_prompts?: Json | null;
          prompt?: string;
          type: Database['public']['Enums']['feature_type'];
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_public?: boolean;
          localized_prompts?: Json | null;
          prompt?: string;
          type?: Database['public']['Enums']['feature_type'];
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      usage_events: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          credits_used: number;
          dollar_amount: number | null;
          duration_seconds: number | null;
          id: string;
          input_chars: number | null;
          metadata: Json | null;
          model: string | null;
          occurred_at: string;
          output_chars: number | null;
          quantity: number;
          request_id: string | null;
          source_id: string | null;
          source_type: Database['public']['Enums']['usage_source_type'];
          unit: Database['public']['Enums']['usage_unit_type'];
          user_id: string;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          credits_used: number;
          dollar_amount?: number | null;
          duration_seconds?: number | null;
          id?: string;
          input_chars?: number | null;
          metadata?: Json | null;
          model?: string | null;
          occurred_at?: string;
          output_chars?: number | null;
          quantity: number;
          request_id?: string | null;
          source_id?: string | null;
          source_type: Database['public']['Enums']['usage_source_type'];
          unit: Database['public']['Enums']['usage_unit_type'];
          user_id: string;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          credits_used?: number;
          dollar_amount?: number | null;
          duration_seconds?: number | null;
          id?: string;
          input_chars?: number | null;
          metadata?: Json | null;
          model?: string | null;
          occurred_at?: string;
          output_chars?: number | null;
          quantity?: number;
          request_id?: string | null;
          source_id?: string | null;
          source_type?: Database['public']['Enums']['usage_source_type'];
          unit?: Database['public']['Enums']['usage_unit_type'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usage_events_api_key_id_fkey';
            columns: ['api_key_id'];
            isOneToOne: false;
            referencedRelation: 'api_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      voice_chat_runs: {
        Row: {
          assistant_position: number;
          conversation_id: string;
          expires_at: string;
          id: string;
          status: string;
          usage: Json | null;
          user_id: string;
        };
        Insert: {
          assistant_position: number;
          conversation_id: string;
          expires_at: string;
          id: string;
          status?: string;
          usage?: Json | null;
          user_id: string;
        };
        Update: {
          assistant_position?: number;
          conversation_id?: string;
          expires_at?: string;
          id?: string;
          status?: string;
          usage?: Json | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'voice_chat_runs_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      voice_conversation_leases: {
        Row: {
          conversation_id: string;
          expires_at: string;
          room_name: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          expires_at: string;
          room_name: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          expires_at?: string;
          room_name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'voice_conversation_leases_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      voices: {
        Row: {
          created_at: string | null;
          description: string | null;
          feature: Database['public']['Enums']['feature_type'];
          id: string;
          is_nsfw: boolean | null;
          is_public: boolean | null;
          language: string;
          model: string;
          name: string;
          sample_prompt: string | null;
          sample_url: string | null;
          sort_order: number;
          type: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          feature?: Database['public']['Enums']['feature_type'];
          id?: string;
          is_nsfw?: boolean | null;
          is_public?: boolean | null;
          language: string;
          model: string;
          name: string;
          sample_prompt?: string | null;
          sample_url?: string | null;
          sort_order?: number;
          type?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          feature?: Database['public']['Enums']['feature_type'];
          id?: string;
          is_nsfw?: boolean | null;
          is_public?: boolean | null;
          language?: string;
          model?: string;
          name?: string;
          sample_prompt?: string | null;
          sample_url?: string | null;
          sort_order?: number;
          type?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'voices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      api_usage_daily: {
        Row: {
          api_key_id: string | null;
          model: string | null;
          requests: number | null;
          source_type: Database['public']['Enums']['usage_source_type'] | null;
          total_credits_used: number | null;
          total_dollar_amount: number | null;
          total_duration_seconds: number | null;
          total_input_chars: number | null;
          total_output_chars: number | null;
          usage_date: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'usage_events_api_key_id_fkey';
            columns: ['api_key_id'];
            isOneToOne: false;
            referencedRelation: 'api_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      append_voice_call_message: {
        Args: {
          p_conversation_id: string;
          p_interrupted: boolean;
          p_item_id: string;
          p_role: string;
          p_room_name: string;
          p_text: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      conversation_text_parts_valid: {
        Args: { parts: Json };
        Returns: boolean;
      };
      decrement_user_credits: {
        Args: { credit_amount_var: number; user_id_var: string };
        Returns: undefined;
      };
      decrement_user_credits_up_to: {
        Args: { credit_amount_var: number; user_id_var: string };
        Returns: number;
      };
      erase_account_conversations: {
        Args: { p_user_id: string };
        Returns: number;
      };
      get_usage_summary: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string };
        Returns: {
          operation_count: number;
          source_type: Database['public']['Enums']['usage_source_type'];
          total_credits: number;
        }[];
      };
      increment_user_credits: {
        Args: { credit_amount_var: number; user_id_var: string };
        Returns: undefined;
      };
      match_agent_memories_hybrid: {
        Args: {
          match_count?: number;
          p_character_id?: string;
          p_user_id: string;
          query_embedding: string;
          query_text: string;
        };
        Returns: {
          character_id: string;
          content: string;
          cosine_distance: number;
          memory_type: string;
          rrf_score: number;
          text_rank: number;
          vector_rank: number;
        }[];
      };
      open_voice_call: {
        Args: {
          p_conversation_id: string;
          p_resume: boolean;
          p_room_name: string;
          p_user_id: string;
        };
        Returns: {
          character_id: string | null;
          character_name: string;
          created_at: string;
          id: string;
          language: string;
          revision: number;
          scene_id: string | null;
          scene_instructions: string;
          updated_at: string;
          user_id: string;
          uses_default_character: boolean;
        };
        SetofOptions: {
          from: '*';
          to: 'conversations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      prune_agent_memories_over_cap: {
        Args: { p_character_id?: string; p_keep?: number; p_user_id: string };
        Returns: number;
      };
      read_conversation_context: {
        Args: { p_conversation_id: string; p_user_id: string };
        Returns: {
          content: string;
          id: string;
          interrupted: boolean;
          role: string;
        }[];
      };
      read_voice_chat: {
        Args: { p_run_id: string; p_user_id: string };
        Returns: {
          reply: string;
          status: string;
          thread_id: string;
        }[];
      };
      restore_inactive_user: {
        Args: { p_auth_created_at: string; p_email: string; p_user_id: string };
        Returns: boolean;
      };
      save_voice_chat_reply: {
        Args: {
          p_run_id: string;
          p_status: string;
          p_text: string;
          p_usage: Json;
          p_user_id: string;
        };
        Returns: boolean;
      };
      start_voice_chat: {
        Args: {
          p_conversation_id: string;
          p_run_id: string;
          p_text: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
      update_api_key_last_used: {
        Args: { p_key_hash: string };
        Returns: undefined;
      };
    };
    Enums: {
      credit_transaction_type: 'purchase' | 'freemium' | 'topup' | 'refund';
      feature_type: 'tts' | 'call';
      usage_source_type:
        | 'tts'
        | 'voice_cloning'
        | 'live_call'
        | 'audio_processing'
        | 'api_tts'
        | 'api_voice_cloning';
      usage_unit_type: 'chars' | 'mins' | 'secs' | 'operation';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

declare type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

declare type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

declare type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

declare type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

declare type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

declare const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      credit_transaction_type: ['purchase', 'freemium', 'topup', 'refund'],
      feature_type: ['tts', 'call'],
      usage_source_type: [
        'tts',
        'voice_cloning',
        'live_call',
        'audio_processing',
        'api_tts',
        'api_voice_cloning',
      ],
      usage_unit_type: ['chars', 'mins', 'secs', 'operation'],
    },
  },
} as const;
