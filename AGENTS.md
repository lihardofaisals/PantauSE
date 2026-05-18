# Project: PantauSE 2026 - Spatial Monitoring Dashboard

This is the official management dashboard for **Sensus Ekonomi 2026**. 
It handles real-time spatial data visualization, bot-based reporting, and personnel management.

## Tech Stack
- **Frontend**: React 19 + Vite 6
- **Styling**: Tailwind CSS v4 (using `@theme` and `@import "tailwindcss"`)
- **Map Engine**: Leaflet + React-Leaflet 5
- **Backend/DB**: Firebase (Firestore)
- **State Management**: React Hooks + Context

## Project Structure
- `/src/components`: UI components (Dashboard, Spatial, WhatsApp Simulator, etc.)
- `/src/services`: Bot logic and data processing
- `/src/lib`: Firebase configuration and helpers
- `/public/maps`: GeoJSON files for Kecamatan, Desa, and SLS levels

## Coding Standards
- Use **Tailwind v4** utility classes.
- Use **Lucide React** for icons.
- Ensure **Glassmorphism** aesthetics (use `.glass-card`, `.glass-panel` from index.css).
- For Spatial logic: Always use hierarchical IDs (7 digits for Kec, 10 for Desa, 14 for SLS).
- Maintain rigorous SEO and Semantic HTML.

## Data Schema
- **SLS Data**: Stored in `sls` collection in Firestore. 
- **Hierarchical Fallback**: Sub-SLS (16 digits) can fallback to SLS (14 digits) for progress visualization.
