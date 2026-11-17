import { useId, type ReactElement } from 'react';
import type { ArtProduct, ArtScene, ArtSpec, SceneComponentId } from '../services/types';

/**
 * Ảnh minh hoạ tự vẽ bằng SVG (không dùng ảnh bên thứ ba nên không phát sinh vấn đề giấy phép).
 * Chỉ là placeholder cho dữ liệu mẫu; sẽ thay bằng ảnh/khung render thật.
 */
export interface MockArtProps {
  art: ArtSpec;
  hidden?: readonly SceneComponentId[];
  shadow?: number;
  tint?: string | null;
  light?: 'natural' | 'soft' | 'dramatic';
  camera?: 'front' | 'angle' | 'top';
  /** góc xoay giả lập (độ) cho xem trước video */
  spin?: number;
  width?: number;
  height?: number;
  standalone?: boolean;
  className?: string;
}

const BRAND = 'BOTANIC';

interface ScenePalette {
  top: string;
  bottom: string;
  glow: string;
  pedestal: 'stone' | 'podium' | 'dark' | 'gold' | 'wood' | 'none';
  leaves: boolean;
  props: 'none' | 'lime' | 'beans' | 'gold' | 'ribbon';
}

const SCENES: Record<ArtScene, ScenePalette> = {
  nature: { top: '#d3dec0', bottom: '#9db38a', glow: '#fff4cf', pedestal: 'stone', leaves: true, props: 'none' },
  studio: { top: '#ece9e2', bottom: '#d2cdc2', glow: '#ffffff', pedestal: 'none', leaves: false, props: 'none' },
  minimal: { top: '#f6efe3', bottom: '#e4d8c4', glow: '#fffaf0', pedestal: 'podium', leaves: false, props: 'none' },
  luxury: { top: '#4a3422', bottom: '#150f0a', glow: '#e3b867', pedestal: 'dark', leaves: false, props: 'ribbon' },
  festive: { top: '#b8202c', bottom: '#6e0f19', glow: '#ffd27a', pedestal: 'gold', leaves: false, props: 'gold' },
  white: { top: '#ffffff', bottom: '#ebebe8', glow: '#ffffff', pedestal: 'none', leaves: false, props: 'none' },
  beverage: { top: '#d6eda7', bottom: '#86bb52', glow: '#fffbd2', pedestal: 'none', leaves: true, props: 'lime' },
  cafe: { top: '#dbb88e', bottom: '#8c5e3c', glow: '#ffe6bd', pedestal: 'wood', leaves: false, props: 'beans' },
};

const BASE_Y = 288;

function Leaf({ x, y, r, s = 1, fill }: { x: number; y: number; r: number; s?: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M0 0 C 18 -26, 56 -26, 78 0 C 56 26, 18 26, 0 0 Z" fill={fill} />
      <path d="M2 0 L 70 0" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" fill="none" />
    </g>
  );
}

function Branch({ x, y, r, flip = false }: { x: number; y: number; r: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M0 0 C 40 -4, 90 6, 140 -6" stroke="#5f7a4e" strokeWidth="2.2" fill="none" />
      <Leaf x={20} y={-1} r={-48} fill="#6f8f5a" />
      <Leaf x={44} y={0} r={42} s={0.9} fill="#86a56e" />
      <Leaf x={70} y={2} r={-40} s={1} fill="#5f8050" />
      <Leaf x={96} y={-1} r={46} s={0.85} fill="#7c9b66" />
      <Leaf x={122} y={-4} r={-35} s={0.8} fill="#92b078" />
    </g>
  );
}

function Pedestal({ kind, id }: { kind: ScenePalette['pedestal']; id: string }) {
  if (kind === 'none') return null;
  const y = BASE_Y;
  if (kind === 'stone') {
    return (
      <g>
        <ellipse cx="200" cy={y + 36} rx="118" ry="16" fill="rgba(60,50,30,0.25)" />
        <path d={`M88 ${y + 6} Q88 ${y + 40} 120 ${y + 42} L280 ${y + 42} Q312 ${y + 40} 312 ${y + 6} Z`} fill={`url(#${id}-stone)`} />
        <ellipse cx="200" cy={y + 6} rx="112" ry="20" fill="#e8dcc6" />
        <ellipse cx="200" cy={y + 4} rx="104" ry="16" fill="#f1e8d6" />
        <path d={`M150 ${y + 20} q10 6 22 2 M228 ${y + 26} q14 4 26 -2`} stroke="rgba(150,130,100,0.35)" strokeWidth="1.5" fill="none" />
        <ellipse cx="82" cy={y + 12} rx="46" ry="30" fill="#d8c9ad" transform={`rotate(-8 82 ${y + 12})`} />
        <ellipse cx="80" cy={y + 4} rx="40" ry="22" fill="#e6d9c0" transform={`rotate(-8 82 ${y + 12})`} />
      </g>
    );
  }
  if (kind === 'podium' || kind === 'dark' || kind === 'gold') {
    const top = kind === 'dark' ? '#2b2018' : kind === 'gold' ? '#e8b954' : '#efe3cf';
    const side = kind === 'dark' ? '#17110c' : kind === 'gold' ? '#b98a2e' : '#d9c8ab';
    const rim = kind === 'dark' ? '#e3b867' : kind === 'gold' ? '#fff0bd' : '#fffaf0';
    return (
      <g>
        <ellipse cx="200" cy={y + 40} rx="112" ry="12" fill="rgba(0,0,0,0.25)" />
        <path d={`M100 ${y + 4} L100 ${y + 36} Q200 ${y + 58} 300 ${y + 36} L300 ${y + 4} Z`} fill={side} />
        <ellipse cx="200" cy={y + 4} rx="100" ry="18" fill={top} />
        <ellipse cx="200" cy={y + 4} rx="100" ry="18" fill="none" stroke={rim} strokeWidth="2" opacity="0.8" />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx="200" cy={y + 34} rx="120" ry="12" fill="rgba(0,0,0,0.25)" />
      <rect x="82" y={y + 2} width="236" height="30" rx="6" fill="#8a5a34" />
      <rect x="82" y={y + 2} width="236" height="9" rx="4" fill="#b88255" />
      <path d={`M120 ${y + 18} h60 M220 ${y + 24} h50`} stroke="rgba(60,30,10,0.35)" strokeWidth="2" />
    </g>
  );
}

function SceneProps({ kind }: { kind: ScenePalette['props'] }) {
  if (kind === 'lime') {
    return (
      <g>
        <g transform="translate(300 300)">
          <circle r="34" fill="#c6e35a" />
          <circle r="28" fill="#eaf7a8" />
          {[0, 45, 90, 135].map((a) => (
            <line key={a} x1="0" y1="-26" x2="0" y2="26" stroke="#c6e35a" strokeWidth="2" transform={`rotate(${a})`} />
          ))}
        </g>
        <g transform="translate(96 312)">
          <circle r="26" fill="#b5d94c" />
          <circle r="21" fill="#e2f39a" />
        </g>
        {[[120, 190], [140, 160], [270, 170], [296, 210], [250, 120], [160, 110]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3 + (i % 3) * 2} fill="rgba(255,255,255,0.65)" />
        ))}
        <path d="M70 250 Q130 200 200 258 T340 240" stroke="rgba(255,255,255,0.55)" strokeWidth="6" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (kind === 'beans') {
    return (
      <g>
        {[[96, 334, 20], [128, 344, -15], [160, 340, 40], [250, 346, 10], [286, 336, -30], [318, 344, 25], [70, 346, -40], [110, 322, 15], [300, 324, 70]].map(([x, y, r], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
            <ellipse rx="11" ry="7" fill="#3d2515" />
            <path d="M-9 0 Q0 -3 9 0" stroke="#7a5236" strokeWidth="1.4" fill="none" />
          </g>
        ))}
        <path d="M330 200 q-8 -14 0 -26 q8 -12 0 -24" stroke="rgba(255,255,255,0.45)" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (kind === 'gold') {
    return (
      <g opacity="0.55">
        {[[60, 80], [330, 120], [84, 200], [320, 250], [210, 60], [40, 300], [360, 300]].map(([x, y], i) => (
          <Leaf key={i} x={x!} y={y!} r={-40 + i * 25} s={0.5} fill="#f0c36a" />
        ))}
      </g>
    );
  }
  if (kind === 'ribbon') {
    return (
      <g fill="none" strokeLinecap="round">
        <path d="M-10 250 C 90 150, 190 330, 420 190" stroke="#e3b867" strokeWidth="14" opacity="0.35" />
        <path d="M-10 262 C 90 162, 190 342, 420 202" stroke="#fff2c8" strokeWidth="2.5" opacity="0.7" />
      </g>
    );
  }
  return null;
}

function Label({ y, w = 52, h = 50, dark = false }: { y: number; w?: number; h?: number; dark?: boolean }) {
  const ink = dark ? '#f1e6cf' : '#4a5f3e';
  return (
    <g>
      <rect x={-w / 2} y={y} width={w} height={h} rx="3" fill={dark ? '#2f3d29' : '#f5eedb'} />
      <text x="0" y={y + 17} textAnchor="middle" fontSize="8" letterSpacing="1.6" fill={ink} fontFamily="Georgia, serif">
        {BRAND}
      </text>
      <path d={`M-9 ${y + h - 8} q9 -20 18 0 q-9 8 -18 0 Z`} fill={dark ? '#a9bf8e' : '#7f9b69'} />
      <path d={`M0 ${y + h - 6} v-11`} stroke={ink} strokeWidth="0.8" />
    </g>
  );
}

function Product({ kind, id }: { kind: ArtProduct; id: string }): ReactElement {
  switch (kind) {
    case 'serum':
      return (
        <g>
          <rect x="-34" y="-112" width="68" height="112" rx="12" fill={`url(#${id}-amber)`} />
          <path d="M-34 -100 Q-34 -118 -14 -122 L14 -122 Q34 -118 34 -100 Z" fill={`url(#${id}-amber)`} />
          <rect x="-12" y="-134" width="24" height="14" fill="#1e1a17" />
          <rect x="-15" y="-142" width="30" height="9" rx="2" fill="#2a2420" />
          <rect x="-5" y="-166" width="10" height="26" fill="#1e1a17" />
          <path d="M-24 -178 h40 a5 5 0 0 1 5 5 v8 h-45 a5 5 0 0 1 -5 -5 v-3 a5 5 0 0 1 5 -5 Z" fill="#14110f" />
          <path d="M-26 -170 h-7 v5 h7" fill="#14110f" />
          <rect x="-26" y="-92" width="9" height="84" rx="4" fill="rgba(255,255,255,0.2)" />
          <Label y={-84} />
        </g>
      );
    case 'jar':
      return (
        <g>
          <rect x="-46" y="-58" width="92" height="58" rx="10" fill={`url(#${id}-cream)`} />
          <rect x="-48" y="-80" width="96" height="26" rx="6" fill={`url(#${id}-gold)`} />
          <rect x="-48" y="-62" width="96" height="6" fill="rgba(0,0,0,0.12)" />
          <text x="0" y="-26" textAnchor="middle" fontSize="9" letterSpacing="2" fill="#6b7f5a" fontFamily="Georgia, serif">
            {BRAND}
          </text>
          <path d="M-8 -14 q8 -14 16 0 q-8 6 -16 0 Z" fill="#8fa77b" />
        </g>
      );
    case 'box':
      return (
        <g>
          <rect x="-64" y="-84" width="128" height="84" rx="4" fill={`url(#${id}-sage)`} />
          <rect x="-67" y="-98" width="134" height="20" rx="3" fill="#7a9566" />
          <rect x="-9" y="-98" width="18" height="98" fill="#e7efd3" opacity="0.9" />
          <rect x="-67" y="-92" width="134" height="8" fill="#e7efd3" opacity="0.85" />
          <path d="M0 -98 C -34 -128, -48 -92, 0 -98 C 48 -92, 34 -128, 0 -98 Z" fill="#e7efd3" />
          <circle cx="0" cy="-98" r="6" fill="#cfdcb4" />
          <text x="0" y="-40" textAnchor="middle" fontSize="8" letterSpacing="2" fill="#f5f1e0" fontFamily="Georgia, serif">
            {BRAND}
          </text>
          <path d="M-12 -28 q12 -16 24 0 q-12 8 -24 0 Z" fill="#cfdcb4" />
        </g>
      );
    case 'cleanser':
      return (
        <g>
          <rect x="-26" y="-148" width="52" height="148" rx="14" fill={`url(#${id}-white)`} />
          <rect x="-10" y="-162" width="20" height="16" fill="#e7e4dc" />
          <rect x="-5" y="-182" width="10" height="22" fill="#f4f2ec" />
          <path d="M-22 -192 h36 a5 5 0 0 1 5 5 v6 h-41 a5 5 0 0 1 -5 -5 v-1 a5 5 0 0 1 5 -5 Z" fill="#f4f2ec" />
          <rect x="-20" y="-86" width="40" height="52" rx="3" fill="#e9efdc" />
          <text x="0" y="-70" textAnchor="middle" fontSize="7" letterSpacing="1.4" fill="#4a5f3e" fontFamily="Georgia, serif">
            {BRAND}
          </text>
          <path d="M-8 -50 q8 -16 16 0 q-8 8 -16 0 Z" fill="#7f9b69" />
          <rect x="-20" y="-140" width="7" height="110" rx="3" fill="rgba(255,255,255,0.7)" />
        </g>
      );
    case 'tin':
      return (
        <g>
          <ellipse cx="0" cy="0" rx="46" ry="9" fill="#3f5a38" />
          <rect x="-46" y="-110" width="92" height="110" fill={`url(#${id}-greenTin)`} />
          <ellipse cx="0" cy="-110" rx="46" ry="10" fill="#6a8760" />
          <ellipse cx="0" cy="-112" rx="42" ry="8" fill="#5a7650" />
          <rect x="-46" y="-102" width="92" height="8" fill="rgba(255,255,255,0.12)" />
          <rect x="-30" y="-76" width="60" height="44" rx="3" fill="#f3ecd8" />
          <text x="0" y="-60" textAnchor="middle" fontSize="8" letterSpacing="1.6" fill="#44593a" fontFamily="Georgia, serif">
            {BRAND}
          </text>
          <path d="M-9 -40 q9 -16 18 0 q-9 8 -18 0 Z" fill="#7f9b69" />
        </g>
      );
    case 'bag':
      return (
        <g>
          <path d="M-52 0 L-46 -150 L46 -150 L52 0 Z" fill={`url(#${id}-kraft)`} />
          <path d="M-46 -150 L46 -150 L44 -138 L-44 -138 Z" fill="#b98b5d" />
          <path d="M-46 -150 L0 -142 L46 -150" stroke="rgba(80,50,20,0.25)" strokeWidth="1.5" fill="none" />
          <ellipse cx="0" cy="-74" rx="32" ry="38" fill="#f5ead4" />
          <text x="0" y="-84" textAnchor="middle" fontSize="8" letterSpacing="1.6" fill="#6a4a2a" fontFamily="Georgia, serif">
            {BRAND}
          </text>
          <path d="M-14 -62 q14 -20 28 0 q-14 10 -28 0 Z" fill="#8fa06a" />
          <path d="M-40 -130 L-36 -4" stroke="rgba(255,255,255,0.25)" strokeWidth="6" />
        </g>
      );
    case 'perfume':
      return (
        <g>
          <rect x="-36" y="-96" width="72" height="96" rx="8" fill={`url(#${id}-glass)`} />
          <rect x="-30" y="-90" width="60" height="70" rx="5" fill="rgba(255,196,96,0.55)" />
          <rect x="-11" y="-110" width="22" height="16" fill="#c99a3c" />
          <rect x="-20" y="-134" width="40" height="26" rx="4" fill={`url(#${id}-gold)`} />
          <rect x="-22" y="-60" width="44" height="30" rx="2" fill="#f5ead4" />
          <text x="0" y="-45" textAnchor="middle" fontSize="7" letterSpacing="1.4" fill="#6a4a1a" fontFamily="Georgia, serif">
            {BRAND}
          </text>
          <rect x="-30" y="-88" width="8" height="82" rx="4" fill="rgba(255,255,255,0.35)" />
        </g>
      );
    case 'can':
    default:
      return (
        <g>
          <rect x="-34" y="-124" width="68" height="124" rx="6" fill={`url(#${id}-greenCan)`} />
          <ellipse cx="0" cy="-124" rx="34" ry="6" fill="#d9e3d0" />
          <ellipse cx="0" cy="-124" rx="26" ry="4" fill="#b8c7ad" />
          <path d="M-34 -78 L34 -104 L34 -66 L-34 -40 Z" fill="#f7f6e4" opacity="0.92" />
          <text x="0" y="-72" textAnchor="middle" fontSize="8" letterSpacing="1.6" fill="#44683a" fontFamily="Georgia, serif" transform="rotate(-21 0 -72)">
            {BRAND}
          </text>
          <rect x="-26" y="-116" width="7" height="108" rx="3" fill="rgba(255,255,255,0.4)" />
        </g>
      );
  }
}

export function MockArt({
  art,
  hidden = [],
  shadow = 0.7,
  tint = null,
  light = 'natural',
  camera = 'front',
  spin = 0,
  width,
  height,
  standalone = false,
  className,
}: MockArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sc = SCENES[art.scene];
  const hide = new Set(hidden);
  const rot = (spin * Math.PI) / 180;
  const squeeze = spin ? 0.82 + 0.18 * Math.abs(Math.cos(rot)) : 1;
  const camScale = camera === 'top' ? 0.88 : camera === 'angle' ? 1.06 : 1;
  const baseY = sc.pedestal === 'none' ? BASE_Y + 12 : BASE_Y;
  const shadowOpacity = Math.max(0, Math.min(1, shadow)) * 0.5;
  const lightOpacity = light === 'dramatic' ? 0.6 : light === 'soft' ? 0.18 : 0.38;
  const dark = art.scene === 'luxury' || art.scene === 'festive';

  return (
    <svg
      xmlns={standalone ? 'http://www.w3.org/2000/svg' : undefined}
      viewBox="0 0 400 400"
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-hidden="true"
      className={className}
      data-art-scene={art.scene}
      data-art-product={art.product}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sc.top} />
          <stop offset="1" stopColor={sc.bottom} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.25" cy="0.12" r="0.8">
          <stop offset="0" stopColor={sc.glow} stopOpacity={lightOpacity + 0.2} />
          <stop offset="1" stopColor={sc.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-vig`} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={light === 'dramatic' ? 0.55 : dark ? 0.3 : 0.12} />
        </radialGradient>
        <linearGradient id={`${uid}-amber`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a4410" />
          <stop offset="0.45" stopColor="#c0791f" />
          <stop offset="1" stopColor="#6c3a0c" />
        </linearGradient>
        <linearGradient id={`${uid}-cream`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e6dcc6" />
          <stop offset="0.5" stopColor="#fbf6ea" />
          <stop offset="1" stopColor="#dcd0b6" />
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8cf8b" />
          <stop offset="1" stopColor="#b58b3a" />
        </linearGradient>
        <linearGradient id={`${uid}-sage`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7e9a69" />
          <stop offset="0.5" stopColor="#9db586" />
          <stop offset="1" stopColor="#74905f" />
        </linearGradient>
        <linearGradient id={`${uid}-white`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#dedbd2" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d6d2c8" />
        </linearGradient>
        <linearGradient id={`${uid}-greenTin`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b5535" />
          <stop offset="0.45" stopColor="#5b7a52" />
          <stop offset="1" stopColor="#33482e" />
        </linearGradient>
        <linearGradient id={`${uid}-kraft`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b38655" />
          <stop offset="0.5" stopColor="#d1a672" />
          <stop offset="1" stopColor="#a67a4a" />
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6a4310" />
          <stop offset="0.5" stopColor="#d9a24b" />
          <stop offset="1" stopColor="#5a350b" />
        </linearGradient>
        <linearGradient id={`${uid}-greenCan`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4e8a3a" />
          <stop offset="0.5" stopColor="#8cc65a" />
          <stop offset="1" stopColor="#437a31" />
        </linearGradient>
        <linearGradient id={`${uid}-stone`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#cdbd9f" />
          <stop offset="0.5" stopColor="#e4d7bd" />
          <stop offset="1" stopColor="#c3b293" />
        </linearGradient>
        <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <rect width="400" height="400" fill={`url(#${uid}-bg)`} />
      {tint ? <rect width="400" height="400" fill={tint} opacity="0.5" /> : null}
      <rect width="400" height="400" fill={`url(#${uid}-glow)`} />
      <SceneProps kind={sc.props} />

      {sc.leaves && !hide.has('leaves') ? (
        <g>
          <g opacity="0.9" filter={`url(#${uid}-soft)`}>
            <Branch x={-20} y={64} r={22} />
            <Branch x={420} y={40} r={158} flip />
            <Branch x={150} y={-6} r={64} />
          </g>
          <g filter={`url(#${uid}-blur)`} opacity="0.35">
            <Leaf x={60} y={190} r={-30} s={1.6} fill="#3e5a32" />
            <Leaf x={300} y={150} r={30} s={1.4} fill="#3e5a32" />
          </g>
        </g>
      ) : null}

      <Pedestal kind={hide.has('pedestal') ? 'none' : sc.pedestal} id={uid} />

      <ellipse
        cx="200"
        cy={baseY + 3}
        rx={56 * squeeze + 8}
        ry="9"
        fill="#000"
        opacity={shadowOpacity}
        filter={`url(#${uid}-blur)`}
      />

      {hide.has('product') ? null : (
        <g transform={`translate(200 ${baseY}) scale(${camScale * squeeze} ${camScale})`} data-testid="art-product">
          <Product kind={art.product} id={uid} />
        </g>
      )}

      {sc.leaves && !hide.has('leaves') && art.scene === 'nature' ? (
        <g>
          <Branch x={430} y={338} r={-160} flip />
          <Leaf x={300} y={392} r={-100} s={1.1} fill="#6f8f5a" />
        </g>
      ) : null}

      <rect width="400" height="400" fill={`url(#${uid}-vig)`} />
    </svg>
  );
}
