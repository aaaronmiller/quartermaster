// Quartermaster web — GSAP animation layer
// Drives entrance reveals, nav micro-interactions, table row staggers,
// and section scroll-triggered effects. Respects prefers-reduced-motion.

import gsap from "https://cdn.skypack.dev/gsap@3.12.5";

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DUR = prefersReduced ? 0 : 0.6;

gsap.defaults({ duration: DUR, ease: "power3.out" });

function navMicroInteractions() {
  const links = document.querySelectorAll<HTMLElement>(".nav-link");
  const indicator = document.querySelector<HTMLElement>(".nav-indicator");

  if (!indicator || links.length === 0) return;

  function moveIndicator(el: HTMLElement) {
    if (!indicator || prefersReduced) return;
    gsap.to(indicator, {
      x: el.offsetLeft,
      width: el.offsetWidth,
      duration: 0.35,
      ease: "power2.out",
      overwrite: "auto",
    });
  }

  links.forEach((link) => {
    link.addEventListener("mouseenter", () => moveIndicator(link));
    link.addEventListener("click", () => moveIndicator(link));
    link.addEventListener("focus", () => moveIndicator(link));
  });

  const active = document.querySelector<HTMLElement>(".nav-link.active");
  if (active) {
    gsap.set(indicator, { x: active.offsetLeft, width: active.offsetWidth, autoAlpha: 1 });
  }
}

function sectionEntrance() {
  const sections = document.querySelectorAll<HTMLElement>(".anim-section");
  if (sections.length === 0) return;

  if (prefersReduced) {
    gsap.set(sections, { autoAlpha: 1, y: 0 });
    return;
  }

  gsap.fromTo(
    sections,
    { autoAlpha: 0, y: 24 },
    {
      autoAlpha: 1,
      y: 0,
      stagger: 0.12,
      duration: 0.7,
      ease: "power2.out",
      clearProps: "transform",
    },
  );
}

function cardReveal() {
  const cards = document.querySelectorAll<HTMLElement>(".glass-card");
  if (cards.length === 0) return;

  if (prefersReduced) {
    gsap.set(cards, { autoAlpha: 1, scale: 1 });
    return;
  }

  gsap.fromTo(
    cards,
    { autoAlpha: 0, scale: 0.96, y: 16 },
    {
      autoAlpha: 1,
      scale: 1,
      y: 0,
      stagger: 0.08,
      duration: 0.55,
      ease: "back.out(1.2)",
    },
  );
}

function rowStagger() {
  const rows = document.querySelectorAll<HTMLElement>(".data-row");
  if (rows.length === 0) return;

  if (prefersReduced) {
    gsap.set(rows, { autoAlpha: 1, x: 0 });
    return;
  }

  gsap.fromTo(
    rows,
    { autoAlpha: 0, x: -12 },
    { autoAlpha: 1, x: 0, stagger: 0.04, duration: 0.45, ease: "power2.out" },
  );
}

function pulseBadges() {
  const badges = document.querySelectorAll<HTMLElement>(".status-badge");
  if (badges.length === 0 || prefersReduced) return;

  gsap.fromTo(
    badges,
    { scale: 0.8, autoAlpha: 0 },
    {
      scale: 1,
      autoAlpha: 1,
      stagger: 0.06,
      duration: 0.5,
      ease: "back.out(2)",
      delay: 0.4,
    },
  );
}

function heroMeter() {
  const meters = document.querySelectorAll<HTMLElement>(".hero-meter-fill");
  if (meters.length === 0 || prefersReduced) return;

  meters.forEach((bar) => {
    const target = parseFloat(bar.dataset.width || "0");
    gsap.fromTo(
      bar,
      { width: "0%" },
      { width: `${target}%`, duration: 1.2, ease: "power3.inOut", delay: 0.3 },
    );
  });
}

function initScrollReveal() {
  if (prefersReduced) return;
  const targets = document.querySelectorAll<HTMLElement>(".scroll-reveal");
  if (targets.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          gsap.fromTo(
            entry.target,
            { autoAlpha: 0, y: 20 },
            { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" },
          );
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );

  targets.forEach((t) => observer.observe(t));
}

document.addEventListener("DOMContentLoaded", () => {
  navMicroInteractions();
  sectionEntrance();
  cardReveal();
  rowStagger();
  pulseBadges();
  heroMeter();
  initScrollReveal();
});
