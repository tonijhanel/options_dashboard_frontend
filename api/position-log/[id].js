import { proxyToRailway } from '../_lib/proxy.js';

export default function handler(req, res) {
  const { id } = req.query;
  return proxyToRailway(req, res, `/position-log/${id}`);
}