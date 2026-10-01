/** Venue / directions details an event shows on its passes and public page. */
import { IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Only map services, so a pass can't carry an arbitrary (phishing) link.
const MAP_URL_RE = /^https:\/\/((www\.|maps\.)?google\.[a-z.]+\/maps|maps\.app\.goo\.gl\/|goo\.gl\/maps\/|maps\.apple\.com\/|(www\.)?openstreetmap\.org\/|(www\.)?mappls\.com\/|(www\.)?bing\.com\/maps)\S*$/i;

export class VenueFields {
  @IsOptional() @IsString() @MaxLength(300) venueAddress?: string;
  @IsOptional() @IsString() @MaxLength(150) venueLandmark?: string;
  @IsOptional() @Matches(/^(\d{6})?$/, { message: 'PIN code must be 6 digits' }) venuePincode?: string;
  @IsOptional() @Matches(new RegExp(`(^$)|${MAP_URL_RE.source}`, 'i'), { message: 'Map link must be a Google Maps, Apple Maps, OpenStreetMap, Mappls or Bing Maps https link' }) @MaxLength(500) venueMapUrl?: string;
  @IsOptional() @IsLatitude() venueLat?: number;
  @IsOptional() @IsLongitude() venueLng?: number;
  @IsOptional() @IsString() @MaxLength(500) venueNotes?: string;
  @IsOptional() @Matches(/^(\+91[\s-]?)?[6-9]\d{9}$|^$/, { message: 'Enter a valid 10-digit Indian mobile number' }) venueContactPhone?: string;
}

const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

export function venueData(dto: VenueFields) {
  return {
    venueAddress: blank(dto.venueAddress), venueLandmark: blank(dto.venueLandmark), venuePincode: blank(dto.venuePincode),
    venueMapUrl: blank(dto.venueMapUrl), venueNotes: blank(dto.venueNotes), venueContactPhone: blank(dto.venueContactPhone),
    venueLat: dto.venueLat, venueLng: dto.venueLng,
  };
}

export const VENUE_SELECT = {
  location: true, city: true, state: true, venueAddress: true, venueLandmark: true, venuePincode: true,
  venueMapUrl: true, venueLat: true, venueLng: true, venueNotes: true, venueContactPhone: true,
} as const;

type VenueRow = {
  location: string | null; city: string | null; state: string | null; venueAddress: string | null; venueLandmark: string | null;
  venuePincode: string | null; venueMapUrl: string | null; venueLat: number | null; venueLng: number | null; venueNotes: string | null; venueContactPhone: string | null;
};

/** Public venue block; `mapUrl` is the mandal's own link, else a Google Maps search built from the pin or the address. */
export function presentVenue(e: VenueRow) {
  const line = [e.venueAddress, e.city, e.state, e.venuePincode].filter(Boolean).join(', ');
  const query = e.venueLat != null && e.venueLng != null ? `${e.venueLat},${e.venueLng}` : [e.location, line].filter(Boolean).join(', ');
  return {
    name: e.location, address: e.venueAddress, landmark: e.venueLandmark, city: e.city, state: e.state, pincode: e.venuePincode,
    fullAddress: [e.location, line].filter(Boolean).join(', ') || null,
    lat: e.venueLat, lng: e.venueLng, notes: e.venueNotes, contactPhone: e.venueContactPhone,
    mapUrl: e.venueMapUrl || (query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null),
    embedUrl: query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : null,
  };
}
