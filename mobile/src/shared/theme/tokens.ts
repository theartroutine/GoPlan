export const colors = {
  background: '#FFFFFF',
  surface: '#F2F4F7',
  text: '#0B1420',
  textMuted: '#5B6B7C',
  primary: '#0A6CDB',
  primaryPressed: '#0857B0',
  border: '#D8DFE8',
  danger: '#C0392B',
  success: '#1E7A45',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

export const radii = { sm: 6, md: 10, lg: 14 } as const;
