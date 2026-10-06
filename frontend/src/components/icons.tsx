import type { SVGProps } from "react";

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.1em"
      height="1.1em"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconFuncionarios(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </IconBase>
  );
}

export function IconCidadaos(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M15 15.2c2.4.4 4 2.3 4 4.8" />
    </IconBase>
  );
}

export function IconFormularios(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 3.5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" />
      <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5" />
    </IconBase>
  );
}

export function IconAtendimentos(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </IconBase>
  );
}

export function IconRecepcao(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <path d="M3 15h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M12 3v2" />
      <circle cx="12" cy="20.5" r="0.8" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconFilaNucleo(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <path d="M18 15l2 3 2-3" />
    </IconBase>
  );
}

/** Núcleo (grupo de atendimento): quatro blocos. */
export function IconNucleo(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </IconBase>
  );
}

/** Sala/guichê: porta. */
export function IconSala(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
      <path d="M3 21h18" />
      <circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconUnidades(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </IconBase>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase strokeWidth={2} {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </IconBase>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase strokeWidth={2} {...props}>
      <path d="M6 9l6 6 6-6" />
    </IconBase>
  );
}
