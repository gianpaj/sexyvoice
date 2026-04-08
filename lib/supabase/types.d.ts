/** biome-ignore-all lint/style/useConsistentTypeDefinitions: <explanation> */
declare type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

declare type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)';
  };
  public: {
    Tables: {
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
      call_sessions: {
        Row: {
          billed_minutes: number;
          created_at: string | null;
          credits_used: number;
          duration_seconds: number;
          end_reason: string | null;
          ended_at: string | null;
          free_call: boolean | null;
          grok_image_enabled: boolean | null;
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
          created_at?: string | null;
          credits_used?: number;
          duration_seconds?: number;
          end_reason?: string | null;
          ended_at?: string | null;
          free_call?: boolean | null;
          grok_image_enabled?: boolean | null;
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
          created_at?: string | null;
          credits_used?: number;
          duration_seconds?: number;
          end_reason?: string | null;
          ended_at?: string | null;
          free_call?: boolean | null;
          grok_image_enabled?: boolean | null;
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
      credit_allowance_alert_emails: {
        Row: {
          created_at: string;
          credit_transaction_id: string;
          email: string;
          error_message: string | null;
          id: string;
          resend_message_id: string | null;
          sent_at: string | null;
          status: string;
          threshold_percent: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credit_transaction_id: string;
          email: string;
          error_message?: string | null;
          id?: string;
          resend_message_id?: string | null;
          sent_at?: string | null;
          status?: string;
          threshold_percent: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credit_transaction_id?: string;
          email?: string;
          error_message?: string | null;
          id?: string;
          resend_message_id?: string | null;
          sent_at?: string | null;
          status?: string;
          threshold_percent?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_allowance_alert_emails_credit_transaction_id_fkey';
            columns: ['credit_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'credit_transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_allowance_alert_emails_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
            isOneToOne: true;
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
          credit_transaction_id: string | null;
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
          credit_transaction_id?: string | null;
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
          credit_transaction_id?: string | null;
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
            foreignKeyName: 'usage_events_credit_transaction_id_fkey';
            columns: ['credit_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'credit_transactions';
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
          model?: string;
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
      decrement_user_credits: {
        Args: { credit_amount_var: number; user_id_var: string };
        Returns: undefined;
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
