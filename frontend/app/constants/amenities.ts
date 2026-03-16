export interface AmenityOption {
  key: string;
  label: string;
  icon: string;
}

export const AMENITY_OPTIONS: AmenityOption[] = [
  { key: 'free_parking', label: 'Free Parking', icon: 'car' },
  { key: 'paid_parking', label: 'Paid Parking', icon: 'car-profile' },
  { key: 'gym', label: 'Gym', icon: 'barbell' },
  { key: 'pool', label: 'Pool', icon: 'swimming-pool' },
  { key: 'wifi', label: 'WiFi', icon: 'wifi-high' },
  { key: 'ac', label: 'AC', icon: 'fan' },
  { key: 'heating', label: 'Heating', icon: 'flame' },
  { key: 'security', label: '24/7 Security', icon: 'shield-check' },
  { key: 'concierge', label: 'Concierge', icon: 'bell-ringing' },
  { key: 'balcony', label: 'Balcony', icon: 'balcony' },
  { key: 'terrace', label: 'Terrace', icon: 'tree' },
  { key: 'garden', label: 'Garden', icon: 'plant' },
  { key: 'pet_friendly', label: 'Pet Friendly', icon: 'dog' },
  { key: 'furnished', label: 'Furnished', icon: 'couch' },
  { key: 'laundry', label: 'Laundry', icon: 'washing-machine' },
  { key: 'storage', label: 'Storage', icon: 'archive-box' },
  { key: 'children_play_area', label: 'Children Play Area', icon: 'baby' },
  { key: 'bbq_area', label: 'BBQ Area', icon: 'fire' },
  { key: 'maids_room', label: 'Maids Room', icon: 'user' },
  { key: 'study_room', label: 'Study Room', icon: 'book-open' },
];
