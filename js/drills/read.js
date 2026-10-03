// Reading from the book: which pages, what to look for, and a check-off.
import { html, render } from '../html.js';
import { BOOK } from '../curriculum.js';

export const read = {
  title: 'Read',
  mount(ctx) {
    const { el, cfg, store } = ctx;
    const R = () => (store.progress.read ||= {});
    const done = () => !!R()[cfg.pages];
    function draw() {
      render(el, html`
        <div class="card drill-card read">
          <div class="read-pages">pp. ${cfg.pages}</div>
          <p>${cfg.what || ''}</p>
          <p class="muted small">${BOOK}. Read with the piano nearby and try every example as you go.</p>
          <label class="check big"><input type="checkbox" ${done() ? 'checked' : ''}> I’ve read pp. ${cfg.pages}</label>
        </div>`);
      el.querySelector('input').onchange = e => {
        if (e.target.checked) { R()[cfg.pages] = Date.now(); ctx.done({ read: cfg.pages }); }
        else delete R()[cfg.pages];
        store.save();
      };
    }
    draw();
    return { destroy() {} };
  },
};
