'use strict';
const { db } = require('./db');

function gt(game, lang) { return !game ? '' : (lang === 'zh' && game.title_zh ? game.title_zh : game.title_en); }
function gd(game, lang) { return !game ? '' : (lang === 'zh' && game.desc_zh ? game.desc_zh : game.desc_en); }
function gh(game, lang) { return !game ? '' : (lang === 'zh' && game.howto_zh ? game.howto_zh : game.howto_en); }

const SORTS = {
  popular: 'g.plays DESC, g.id ASC',
  new: 'g.created_at DESC, g.id DESC',
  likes: 'g.likes DESC, g.id ASC',
  name: 'g.title_en COLLATE NOCASE ASC'
};

function listGames(opt) {
  const o = opt || {};
  const per = Math.min(60, Math.max(1, parseInt(o.per, 10) || 24));
  const where = [];
  const args = [];
  if (!o.includeUnpublished) where.push('g.published=1');
  if (o.category) { where.push('g.category=?'); args.push(o.category); }
  if (o.q) {
    where.push('(g.title_en LIKE ? OR g.title_zh LIKE ? OR g.tags LIKE ? OR g.slug LIKE ?)');
    const like = '%' + o.q + '%';
    args.push(like, like, like, like);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const order = SORTS[o.sort] || SORTS.popular;
  const total = db.prepare('SELECT COUNT(*) n FROM games g ' + w).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, parseInt(o.page, 10) || 1), pages);
  const rows = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh FROM games g LEFT JOIN categories c ON c.slug=g.category ' + w + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?').all(...args, per, (page - 1) * per);
  return { games: rows, total, page, pages };
}

module.exports = { gt, gd, gh, listGames, SORTS };
