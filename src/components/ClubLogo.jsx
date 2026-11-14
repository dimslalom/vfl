import { defaultLogoStyle, logoSvg } from '../engine/club/logo';
import { assembleCrest, savedRecipe } from '../engine/club/crestKit';
import { useCrestPaths } from '../lib/crestParts';

const SMALL = 32;

function Mark({ markup, size, className }) {
  return (
    <span
      className={className}
      style={{ display: 'block', width: size, height: size, flex: 'none' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
    />
  );
}

// A crest from the parts library: drawn once its one or two path files are in.
function PartsCrest({ recipe, size, className }) {
  const paths = useCrestPaths(recipe.marks);
  const small = typeof size === 'number' && size <= SMALL;
  return <Mark className={className} size={size} markup={paths ? assembleCrest(recipe, paths, { small }) : null} />;
}

// A club's own mark. A saved parts crest (`k1~...`) is assembled from the parts
// library; anything else is an older letter crest drawn from the name. Markup
// only ever comes from those two builders.
export default function ClubLogo({ name, style, tone, size, className }) {
  const recipe = savedRecipe(style, name, tone);
  if (recipe) return <PartsCrest recipe={recipe} size={size} className={className} />;
  return <Mark className={className} size={size} markup={logoSvg(name, style ?? defaultLogoStyle(name), tone)} />;
}
