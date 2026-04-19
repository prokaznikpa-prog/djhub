import djThededzzy from "@/assets/dj-thededzzy.jpg";
import djDegoga from "@/assets/dj-degoga.jpg";
import venueMox from "@/assets/venue-mox.jpg";
import venueLoungeCoste from "@/assets/venue-lounge-coste.jpg";

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

export const VENUE_TYPES = ["Бар", "Клуб", "Lounge", "Ресторан", "Опен-эйр", "Другое"];

export const djs: DJ[] = [
  {
    id: "thededzzy",
    name: "Thededzzy",
    city: "Санкт-Петербург",
    styles: ["Techno", "Hip-Hop", "Witch House"],
    priorityStyle: "Techno",
    experience: "6 месяцев",
    playedAt: ["Мох", "Technodoner", "Midnight Club", "Look Lounge", "Hookah Lounge", "Blast Project", "Tglinki"],
    price: "1500 ₽/час",
    availability: "Любые дни",
    format: "Любое заведение",
    bio: "Свожу всё, что сводится и не сводится. Не использую коней в упряжке.",
    contact: "https://t.me/ourcreatoor",
    openToCollab: true,
    openToCrew: true,
    socials: [
      { label: "Telegram", url: "https://t.me/ourcreatoor" },
      { label: "SoundCloud", url: "https://on.soundcloud.com/nSN0zwqTsRHhxm3chm" },
    ],
    image: djThededzzy,
  },
  {
    id: "degoga",
    name: "DEGOGA",
    city: "Санкт-Петербург",
    styles: ["Hip-Hop", "House", "Techno"],
    priorityStyle: "Hip-Hop",
    experience: "6 месяцев",
    playedAt: ["MOX"],
    price: "1500 ₽/час",
    availability: "Любые дни",
    format: "В любом месте",
    bio: "Хочу видеть себя в каждом клубе родного города.",
    contact: "https://t.me/vladimirussss",
    openToCollab: true,
    openToCrew: true,
    socials: [
      { label: "Telegram", url: "https://t.me/vladimirussss" },
      { label: "Instagram", url: "https://www.instagram.com/vladimirussss" },
    ],
    image: djDegoga,
  },
];

export const venues: Venue[] = [
  {
    id: "mox",
    name: "Мох",
    city: "Пушкин, Санкт-Петербург",
    address: "Оранжерейная улица, 15А",
    type: "Бар",
    description: "Аутентичный бар с андеграунд-настроением, упором на атмосферу, селекцию и живой вайб.",
    music: ["House", "Techno", "DnB"],
    equipment: "CDJ 900, DJM-850",
    foodDrinks: "Не входит",
    contact: "https://t.me/mox_pushkin",
    image: venueMox,
  },
  {
    id: "lounge-coste",
    name: "LOUNGE COSTE",
    city: "Санкт-Петербург",
    type: "Lounge bar",
    description: "Атмосферное lounge-пространство с мягким светом, вечерним настроением и акцентом на стильную музыкальную селекцию.",
    music: ["Deep House", "Minimal", "Tech House"],
    equipment: "CDJ-2000NXS2, DJM-900",
    foodDrinks: "Напитки включены",
    contact: "",
    image: venueLoungeCoste,
  },
];

export const gigs: Gig[] = [
  {
    id: "gig-mox-1",
    venueId: "mox",
    venueName: "Мох",
    city: "Пушкин, СПб",
    date: "27.10.2026",
    time: "22:00–23:00",
    budget: "3 000 ₽",
    style: "House",
    format: "Разово",
    status: "open",
  },
  {
    id: "gig-lounge-1",
    venueId: "lounge-coste",
    venueName: "LOUNGE COSTE",
    city: "Санкт-Петербург",
    date: "30.10.2026",
    time: "21:00–01:00",
    budget: "8 000 ₽",
    style: "Deep House",
    format: "Регулярка",
    status: "closed",
  },
];
