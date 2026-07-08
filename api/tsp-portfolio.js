import { proxyToRailway } from './_lib/proxy.js';

export default function handler(req, res) {
  return proxyToRailway(req, res, '/tsp-portfolio');
}
