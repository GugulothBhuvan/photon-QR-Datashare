/**
 * The Photon mark.
 *
 * A burst of light rays — the logo's only colour is #FBB040, which is where the
 * whole amber palette comes from (`src/constants/tokens.ts`).
 *
 * The path is transcribed from `assets/logo.svg` rather than loaded at runtime:
 * React Native has no SVG file loader without another dependency, and a mark
 * that ships inside the binary cannot fail to load.
 *
 * It takes its colour from the theme by default, so it stays legible in the
 * light scheme where raw #FBB040 would be too pale to read.
 */
import Svg, { Path } from 'react-native-svg';

import { useTheme } from './ThemeProvider';

export interface LogoProps {
  /** Side length in points. The mark is square. */
  readonly size?: number;
  /** Overrides the themed colour. */
  readonly color?: string;
}

/** The logo's own amber, for places that must not be themed. */
export const LOGO_AMBER = '#FBB040';

const VIEW_BOX = '0 0 796.77 779.27';
const PATH =
  'M796.27,105l-.36.12C709.18,133.3,531.75,190.09,445,218.26q-116.41,37.8-232.85,75.51c-4.41,1.43-8.69,4.32-14.69,2.75C321.2,206.63,477.44,90.67,602.2,0H486.32C385.51,73.59,262.69,164.91,167.12,234.39c-3.22,2.34-6.56,4.53-11.15,5.57,43.6-60,118.32-159.66,177.8-240H249.6C221.38,42.4,140,146.38,112.22,184.28c-2.93,4-4.79,9.42-10.42,11-3.8-3.28.29-6.09,1.07-8.55C110.18,163.63,178.52,54.56,208.42,0H191.63C117.12,67.92,8.51,191.29.47,355.16c-.57,11.66-.61,23.15-.18,34.48C-.14,401-.1,412.45.47,424.11,8.51,588,117.12,711.35,191.63,779.27h16.79c-29.9-54.56-98.24-163.63-105.55-186.75-.78-2.46-4.87-5.27-1.07-8.55,5.63,1.6,7.49,7,10.42,11C140,632.89,221.38,736.87,249.6,779.27h84.17c-59.48-80.3-134.2-179.94-177.8-240,4.59,1,7.93,3.23,11.15,5.57,95.57,69.48,218.39,160.8,319.2,234.39H602.2c-124.76-90.67-281-206.63-404.71-296.52,6-1.57,10.28,1.32,14.69,2.75Q328.66,523.12,445,561c86.72,28.17,264.15,85,350.88,113.11l.36.12V602.67C619.65,545.41,381.9,468.89,219.35,416.07c.09-.94.07-.78.16-1.73,2.3-.32,434.22,6.73,577.26,15.22q-.25-12.66-.5-25.33V375l-.52-29.22c-141.49,10.64-526.89,20.27-569.36,20.08l-6.88-1c-.09-.95-.07-.79-.16-1.73,162.55-52.82,400.3-129.34,576.92-186.6Z';

export function Logo({ size = 32, color }: LogoProps) {
  const { colors } = useTheme();

  return (
    <Svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      // Decorative wherever it appears beside the product name, which always
      // states the name in text. A screen reader announcing "image" here would
      // add nothing.
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path d={PATH} fill={color ?? colors.primary} />
    </Svg>
  );
}
