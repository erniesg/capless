# Capless Demo - Viral Parliamentary Moments

A simple demo frontend showcasing viral moments from Singapore Parliament sessions, built with Cloudflare Workers Static Assets.

## Features

- **YouTube Integration**: Embedded player with timestamp jumping
- **Viral Moments Feed**: Curated list of high-impact parliamentary quotes
- **Virality Scoring**: AI-powered analysis of why moments will go viral
- **Clean UI**: Responsive design with Tailwind CSS
- **Placeholder CTA**: "Generate Reaction Video" button (shows alert in MVP)

## Tech Stack

- Cloudflare Workers with Static Assets
- Vanilla HTML/CSS/JavaScript
- Tailwind CSS (CDN)
- YouTube IFrame API

## Project Structure

```
capless-demo/
├── public/
│   └── index.html          # Main frontend (single page)
├── src/
│   └── index.js            # Cloudflare Worker script
├── wrangler.toml           # Cloudflare configuration
├── package.json            # Dependencies
└── README.md               # This file
```

## Data Source (Hardcoded for MVP)

- **Session**: 22 September 2025
- **YouTube Video**: https://www.youtube.com/watch?v=n9ZyN-lwiXg
- **Moments**: Extracted from `/test-outputs/22-09-2024/moments-simple.json`

## Local Development

### Prerequisites

- Node.js 18+ installed
- Cloudflare account (for deployment)

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run local development server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**:
   ```
   http://localhost:8787
   ```

### Usage

1. Click any viral moment in the right panel
2. YouTube player jumps to the exact timestamp
3. Click "Generate Clip" to see placeholder alert (coming soon)
4. Use the timestamp display to track current position

## Deployment

### Deploy to Cloudflare Workers

1. **Authenticate with Cloudflare**:
   ```bash
   npx wrangler login
   ```

2. **Deploy**:
   ```bash
   npm run deploy
   ```

3. **Access your deployed site**:
   ```
   https://capless-demo.<your-subdomain>.workers.dev
   ```

### Configuration

Edit `wrangler.toml` to customize:
- Worker name
- Compatibility date
- Static assets directory

## MVP Limitations

- Hardcoded moments (3 moments from 22-09-2024 session)
- Hardcoded YouTube video ID
- "Generate Reaction Video" shows alert placeholder
- No backend integration yet
- Single session only

## Next Steps (Full Version)

- [ ] Connect to Capless backend API
- [ ] Dynamic session selection
- [ ] Real-time moment generation
- [ ] Actual reaction video generation
- [ ] User authentication
- [ ] Share functionality
- [ ] Multi-session support

## Data Structure

### Moment Object
```json
{
  "moment_id": "demo-moment-1",
  "quote": "Parliamentary quote text",
  "speaker": "Minister Name",
  "timestamp_start": "HH:MM:SS",
  "virality_score": 10,
  "why_viral": "Reason why this will go viral",
  "topic": "Topic category"
}
```

## License

MIT

## Credits

Built with Cloudflare Workers Static Assets for the Capless platform.
