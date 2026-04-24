export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          application_round: number
          created_at: string
          dj_id: string
          hidden_by_dj: boolean
          hidden_by_venue: boolean
          id: string
          message: string | null
          post_id: string
          status: Database["public"]["Enums"]["interaction_status"]
          updated_at: string
        }
        Insert: {
          application_round?: number
          created_at?: string
          dj_id: string
          hidden_by_dj?: boolean
          hidden_by_venue?: boolean
          id?: string
          message?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["interaction_status"]
          updated_at?: string
        }
        Update: {
          application_round?: number
          created_at?: string
          dj_id?: string
          hidden_by_dj?: boolean
          hidden_by_venue?: boolean
          id?: string
          message?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["interaction_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_dj_id_fkey"
            columns: ["dj_id"]
            isOneToOne: false
            referencedRelation: "dj_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "venue_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          application_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          dj_id: string
          id: string
          post_id: string | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          application_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          dj_id: string
          id?: string
          post_id?: string | null
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          application_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          dj_id?: string
          id?: string
          post_id?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_dj_id_fkey"
            columns: ["dj_id"]
            isOneToOne: false
            referencedRelation: "dj_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "venue_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          text: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          text: string
          thread_id: string
        }
        Update: {
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          text?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          application_id: string | null
          booking_id: string | null
          created_at: string
          dj_id: string
          gig_id: string
          hidden_by_dj: boolean
          hidden_by_venue: boolean
          id: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          application_id?: string | null
          booking_id?: string | null
          created_at?: string
          dj_id: string
          gig_id: string
          hidden_by_dj?: boolean
          hidden_by_venue?: boolean
          id?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          application_id?: string | null
          booking_id?: string | null
          created_at?: string
          dj_id?: string
          gig_id?: string
          hidden_by_dj?: boolean
          hidden_by_venue?: boolean
          id?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_dj_id_fkey"
            columns: ["dj_id"]
            isOneToOne: false
            referencedRelation: "dj_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "venue_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dj_profiles: {
        Row: {
          availability: string | null
          bio: string | null
          city: string
          contact: string
          created_at: string
          experience: string | null
          format: string | null
          id: string
          image_url: string | null
          instagram: string | null
          name: string
          open_to_collab: boolean | null
          open_to_crew: boolean | null
          played_at: string[] | null
          price: string
          priority_style: string | null
          soundcloud: string | null
          status: string
          styles: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          availability?: string | null
          bio?: string | null
          city: string
          contact: string
          created_at?: string
          experience?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          instagram?: string | null
          name: string
          open_to_collab?: boolean | null
          open_to_crew?: boolean | null
          played_at?: string[] | null
          price: string
          priority_style?: string | null
          soundcloud?: string | null
          status?: string
          styles?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          availability?: string | null
          bio?: string | null
          city?: string
          contact?: string
          created_at?: string
          experience?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          instagram?: string | null
          name?: string
          open_to_collab?: boolean | null
          open_to_crew?: boolean | null
          played_at?: string[] | null
          price?: string
          priority_style?: string | null
          soundcloud?: string | null
          status?: string
          styles?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gigs: {
        Row: {
          budget: string
          city: string
          created_at: string
          date: string
          format: string | null
          id: string
          status: string
          style: string
          time: string
          venue_id: string | null
          venue_name: string
        }
        Insert: {
          budget: string
          city: string
          created_at?: string
          date: string
          format?: string | null
          id?: string
          status?: string
          style: string
          time: string
          venue_id?: string | null
          venue_name: string
        }
        Update: {
          budget?: string
          city?: string
          created_at?: string
          date?: string
          format?: string | null
          id?: string
          status?: string
          style?: string
          time?: string
          venue_id?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "gigs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          application_round: number
          created_at: string
          dj_id: string
          id: string
          message: string | null
          post_id: string
          status: Database["public"]["Enums"]["interaction_status"]
          updated_at: string
          venue_id: string
        }
        Insert: {
          application_round?: number
          created_at?: string
          dj_id: string
          id?: string
          message?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["interaction_status"]
          updated_at?: string
          venue_id: string
        }
        Update: {
          application_round?: number
          created_at?: string
          dj_id?: string
          id?: string
          message?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["interaction_status"]
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_dj_id_fkey"
            columns: ["dj_id"]
            isOneToOne: false
            referencedRelation: "dj_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "venue_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          related_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          related_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          related_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_posts: {
        Row: {
          application_round: number
          budget: string | null
          city: string
          created_at: string
          deadline: string | null
          description: string | null
          duration: string | null
          event_date: string | null
          frequency: string | null
          id: string
          long_term: boolean | null
          music_styles: string[]
          portfolio_required: boolean | null
          post_type: Database["public"]["Enums"]["post_type"]
          requirements: string | null
          schedule: string | null
          start_time: string | null
          status: string
          title: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          application_round?: number
          budget?: string | null
          city: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          duration?: string | null
          event_date?: string | null
          frequency?: string | null
          id?: string
          long_term?: boolean | null
          music_styles?: string[]
          portfolio_required?: boolean | null
          post_type?: Database["public"]["Enums"]["post_type"]
          requirements?: string | null
          schedule?: string | null
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          application_round?: number
          budget?: string | null
          city?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          duration?: string | null
          event_date?: string | null
          frequency?: string | null
          id?: string
          long_term?: boolean | null
          music_styles?: string[]
          portfolio_required?: boolean | null
          post_type?: Database["public"]["Enums"]["post_type"]
          requirements?: string | null
          schedule?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_posts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_profiles: {
        Row: {
          address: string | null
          city: string
          contact: string
          created_at: string
          description: string | null
          equipment: string | null
          food_drinks: string | null
          id: string
          image_url: string | null
          music_styles: string[]
          name: string
          status: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          city: string
          contact: string
          created_at?: string
          description?: string | null
          equipment?: string | null
          food_drinks?: string | null
          id?: string
          image_url?: string | null
          music_styles?: string[]
          name: string
          status?: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string
          contact?: string
          created_at?: string
          description?: string | null
          equipment?: string | null
          food_drinks?: string | null
          id?: string
          image_url?: string | null
          music_styles?: string[]
          name?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      interaction_status: "new" | "accepted" | "rejected" | "cancelled"
      post_type: "gig" | "casting" | "residency"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      interaction_status: ["new", "accepted", "rejected", "cancelled"],
      post_type: ["gig", "casting", "residency"],
    },
  },
} as const
