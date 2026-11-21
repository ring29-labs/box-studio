import {clean, defaults} from '../web/designer/model.js';
import {renderCatalogue, resolveRenderSpec} from '../web/designer/render-spec.js';

const maxBody = 8192;
const point = value => Array.isArray(value) && value.length === 3 &&
  value.every(component => Number.isFinite(component) && Math.abs(component) <= 30);
const validCamera = camera => camera && point(camera.position) && point(camera.target) &&
  Number.isFinite(camera.fov) && camera.fov > 1 && camera.fov < 120;

export default function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json(renderCatalogue());
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({error: 'Use GET for the catalogue or POST for a design specification.'});
  }
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
    return res.status(415).json({error: 'Send a JSON request.'});
  }
  if (Number(req.headers['content-length']) > maxBody) {
    return res.status(413).json({error: 'The render request is too large.'});
  }
  let payload;
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (raw?.length > maxBody) return res.status(413).json({error: 'The render request is too large.'});
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({error: 'Invalid render request.'});
  }
  const {configuration, hasArtwork = false, camera} = payload ?? {};
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration) ||
      Object.keys(configuration).some(key => !Object.hasOwn(defaults, key) || key === 'artwork') ||
      typeof hasArtwork !== 'boolean' || (camera !== undefined && !validCamera(camera))) {
    return res.status(400).json({error: 'Send supported design settings. Artwork stays with the local design.'});
  }
  try {
    const design = clean(configuration);
    const framing = camera && {position: camera.position, target: camera.target, fov: camera.fov};
    const specification = resolveRenderSpec(design, framing, hasArtwork);
    return res.status(200).json(specification);
  } catch (error) {
    return res.status(422).json({error: error.message});
  }
}
