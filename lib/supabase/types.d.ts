declare type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

declare type Database = {
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
        Relationships: [];
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
      voices: {
        Row: {
          created_at: string | null;
          id: string;
          is_nsfw: boolean | null;
          is_public: boolean | null;
          language: string;
          model: string;
          name: string;
          sample_prompt: string | null;
          sample_url: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_nsfw?: boolean | null;
          is_public?: boolean | null;
          language: string;
          model?: string;
          name: string;
          sample_prompt?: string | null;
          sample_url?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_nsfw?: boolean | null;
          is_public?: boolean | null;
          language?: string;
          model?: string;
          name?: string;
          sample_prompt?: string | null;
          sample_url?: string | null;
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
        Args: { user_id: string; credit_amount: number };
        Returns: undefined;
      };
      increment_user_credits: {
        Args: { user_id: string; credit_amount: number };
        Returns: undefined;
      };
    };
    Enums: {
      credit_transaction_type: 'purchase' | 'usage' | 'freemium' | 'topup';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, 'public'>];

declare type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

declare type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

declare const Constants = {
  public: {
    Enums: {
      credit_transaction_type: ['purchase', 'usage', 'freemium', 'topup'],
    },
  },
} as const;

declare type AudioFile = Database['public']['Tables']['audio_files']['Row'];

declare type CreditTransaction =
  Database['public']['Tables']['credit_transactions']['Row'];

declare type Credit = Database['public']['Tables']['credits']['Row'];

declare type Profile = Database['public']['Tables']['profiles']['Row'];

declare type Voice = Database['public']['Tables']['voices']['Row'];
