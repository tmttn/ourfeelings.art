export interface Feeling {
  id: string;
  emotionId: string; // Which emotion was selected
  color: string;
  path: [number, number][]; // Normalized 0-1 coordinates
  createdAt: number;
  expiresAt: number;
  updateHash?: string; // Only returned to the creator for updates
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface Point {
  x: number;
  y: number;
}
