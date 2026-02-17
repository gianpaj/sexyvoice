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
          created_at: string;
          credits_used: number;
          id: string;
          metadata: Json | null;
          occurred_at: string;
          quantity: number;
          source_id: string | null;
          source_type: Database['public']['Enums']['usage_source_type'];
          unit: Database['public']['Enums']['usage_unit_type'];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credits_used: number;
          id?: string;
          metadata?: Json | null;
          occurred_at?: string;
          quantity: number;
          source_id?: string | null;
          source_type: Database['public']['Enums']['usage_source_type'];
          unit: Database['public']['Enums']['usage_unit_type'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          credits_used?: number;
          id?: string;
          metadata?: Json | null;
          occurred_at?: string;
          quantity?: number;
          source_id?: string | null;
          source_type?: Database['public']['Enums']['usage_source_type'];
          unit?: Database['public']['Enums']['usage_unit_type'];
          user_id?: string;
        };
        Relationships: [
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
      [_ in never]: never;
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
    };
    Enums: {
      credit_transaction_type: 'purchase' | 'freemium' | 'topup' | 'refund';
      feature_type: 'tts' | 'call';
      usage_source_type:
        | 'tts'
        | 'voice_cloning'
        | 'live_call'
        | 'audio_processing';
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
      ],
      usage_unit_type: ['chars', 'mins', 'secs', 'operation'],
    },
  },
} as const;
