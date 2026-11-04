import { defaultLogoStyle, logoSvg } from '../engine/club/logo';

// A club's own mark, drawn from its name. The markup comes only from
// logoSvg, which builds it from cleaned letters and numbers.
export default function ClubLogo({ name, style, tone, size, className }) {
  const markup = logoSvg(name, style ?? defaultLogoStyle(name), tone);
  return (
    <span
      className={className}
      style={{ display: 'block', width: size, height: size, flex: 'none' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
