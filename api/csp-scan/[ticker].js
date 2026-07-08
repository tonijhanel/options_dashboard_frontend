import { proxyToRailway } from '../_lib/proxy.js';

export default function handler(req, res) {
  const { ticker } = req.query;
  return proxyToRailway(req, res, `/csp-scan/${ticker}`);
}
