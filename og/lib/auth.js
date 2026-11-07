export function requireAdmin(req, res) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) {
    res.status(503).send("Dashboard não configurado.");
    return false;
  }
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  if (req.headers.authorization !== expected) {
    res.setHeader("WWW-Authenticate", 'Basic realm="ibgeros", charset="UTF-8"');
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(401).send("Acesso restrito.");
    return false;
  }
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  return true;
}
