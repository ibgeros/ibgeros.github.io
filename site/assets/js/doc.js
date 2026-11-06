/* Preenche números dinâmicos e destaca o índice da página de metodologia. */
const fmtInt = (n) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);

async function boot() {
  try {
    const meta = await (await fetch("data/meta.json")).json();
    const total = meta.totais.homens + meta.totais.mulheres;
    document.querySelectorAll('[data-m="registros"]').forEach((el) => {
      el.textContent = fmtInt(meta.n_registros);
    });
    document.querySelectorAll('[data-m="populacao"]').forEach((el) => {
      el.textContent = (total / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    });
    document.querySelectorAll('[data-m="ufs"]').forEach((el) => {
      el.textContent = meta.ufs.length;
    });
  } catch (e) {
    console.warn("meta não carregada", e);
  }

  const links = Array.from(document.querySelectorAll(".toc a"));
  const sections = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + entry.target.id));
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    sections.forEach((s) => obs.observe(s));
  }
}
boot();
