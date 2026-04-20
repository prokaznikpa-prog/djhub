export interface DJ {
  id: string;
  name: string;
  city: string;
  styles: string[];
  priorityStyle: string;
  experience: string;
  playedAt: string[];
  price: string;
  availability: string;
  format: string;
  bio: string;
  contact: string;
  openToCollab: boolean;
  openToCrew: boolean;
  socials: { label: string; url: string }[];
  image: string;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  address?: string;
  type: string;
  description: string;
  music: string[];
  equipment: string;
  foodDrinks: string;
  contact: string;
  image: string;
}

export interface Gig {
  id: string;
  venueId: string;
  venueName: string;
  city: string;
  date: string;
  time: string;
  budget: string;
  style: string;
  format: string;
  status: "open" | "closed";
}

export const MUSIC_STYLES = [
  "Techno", "House", "Deep House", "Tech House", "Minimal",
  "DnB", "Hip-Hop", "Trap", "R&B", "Witch House",
  "Ambient", "Downtempo", "Disco", "Funk", "Pop",
];
