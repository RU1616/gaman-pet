/* =========================================================
 * どうぶつイラスト（画像ファイルを使わず、SVGをコードで描く）
 *
 *   AnimalArt.render('pig', 0.5) → '<svg>…</svg>' の文字列
 *   fatness … 0（ほっそり）〜 1（まんまる）
 *
 * 数値に合わせて体の幅・高さ・ほっぺが連続的に変わるので、
 * 「食べた分だけ少しずつ丸くなる」様子をそのまま表現できます。
 * ========================================================= */
'use strict';

const AnimalArt = (() => {
  const CX = 120; // 中心のx（座標は 240×240 のマス目で考える）
  const GROUND = 216; // 地面のy
  const VIEW_TOP = 20; // ふだんの表示範囲（上の空きを少し切って 240×220 で見せる）
  const VIEW_H = 220;
  const EYE = '#3B2A22';
  let seq = 0;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const n = (v) => Math.round(v * 10) / 10;
  const pt = (x, y) => n(x) + ',' + n(y);
  const line = (color, width) =>
    `stroke="${color}" stroke-width="${width || 3}" stroke-linejoin="round" stroke-linecap="round"`;
  const ellipse = (cx, cy, rx, ry, attrs) =>
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" ${attrs}/>`;
  const path = (d, attrs) => `<path d="${d}" ${attrs}/>`;
  const both = (draw) => draw(-1) + draw(1); // 左右対称のパーツ（s = -1:左, 1:右）

  /* 太り具合 f から、からだ・あたまの大きさと位置を決める */
  function geometry(f, sp) {
    const bry = lerp(38, 64, f);
    const bcy = GROUND - bry - 3;
    return {
      f,
      brx: lerp(36, 95, f), // からだの横半径（いちばん変わるところ）
      bry, // からだの縦半径
      bcy, // からだの中心y
      hrx: lerp(sp.head.rx[0], sp.head.rx[1], f), // あたまの横半径（ほっぺ）
      hry: lerp(sp.head.ry[0], sp.head.ry[1], f),
      hcy: bcy - bry * lerp(0.8, 0.7, f) - lerp(10, 2, f), // 太るほど首がうまる
      eyeDx: lerp(sp.eye.dx[0], sp.eye.dx[1], f),
      footX: lerp(17, 36, f),
      footY: GROUND - 5,
    };
  }

  /* ---------- 動物ごとの色とパーツ ---------- */
  const SPECIES = {
    hamster: {
      colors: { fur: '#F7BF73', belly: '#FFF9EE', line: '#A66F38', foot: '#FBD2C8', earIn: '#F9AFA8', nose: '#F58DA2' },
      head: { rx: [40, 58], ry: [34, 39] },
      eye: { dx: [15, 21], y: -4, r: 4.8 },
      extent: { side: 3, headSide: 4, earUp: 6 },
      noArms: true,
      noChin: true,
      draw(G, C) {
        const pawY = G.hcy + G.hry + 6;
        return {
          ears: both((s) => {
            const x = CX + s * G.hrx * 0.66;
            const y = G.hcy - G.hry * 0.8;
            return ellipse(x, y, 10.5, 10.5, `fill="${C.fur}" ${line(C.line)}`) + ellipse(x, y + 1, 5.8, 5.8, `fill="${C.earIn}"`);
          }),
          headMarks: ellipse(CX, G.hcy + G.hry * 0.8, G.hrx * 0.95, G.hry * 0.8, `fill="${C.belly}"`),
          face:
            ellipse(CX, G.hcy + 5, 2.8, 2.1, `fill="${C.nose}"`) +
            path(
              `M${pt(CX, G.hcy + 7.5)} v2.5 M${pt(CX - 5.5, G.hcy + 10)} q2.8,3.6 5.5,0 q2.8,3.6 5.5,0`,
              `fill="none" ${line(C.line, 2)}`
            ),
          front:
            // ひまわりのタネ と 手
            path(`M${pt(CX, pawY - 12)} q7,8 0,17 q-7,-9 0,-17 Z`, `fill="#6B5848" ${line('#4A3B30', 1.5)}`) +
            path(`M${pt(CX, pawY - 8)} v9`, `fill="none" ${line('#D9C7A8', 1.2)}`) +
            both((s) => ellipse(CX + s * 8.5, pawY + 1, 5.5, 6.5, `fill="${C.foot}" ${line(C.line, 2.4)}`)),
        };
      },
    },

    cat: {
      colors: { fur: '#FFFCF6', line: '#8B6B58', orange: '#F4A651', brown: '#7A5646', earIn: '#FFC4C8', nose: '#FF9AA5' },
      head: { rx: [39, 51], ry: [33, 37] },
      eye: { dx: [15.5, 19.5], y: -3, r: 4.4 },
      extent: { side: 34, headSide: 4, earUp: 23 },
      draw(G, C) {
        const ear = (s, fill) => {
          const ax = CX + s * G.hrx * 0.6;
          const ay = G.hcy - G.hry * 0.68;
          const d = `M${pt(ax + s * 10, ay + 8)} L${pt(ax + s * 10.5, ay - 29)} Q${pt(ax + s * 10, ay - 32.5)} ${pt(ax + s * 6.5, ay - 30.5)} L${pt(ax - s * 14, ay - 8)} Z`;
          const inner = `M${pt(ax + s * 6, ay + 1)} L${pt(ax + s * 6.8, ay - 20)} L${pt(ax - s * 6.5, ay - 6)} Z`;
          return path(d, `fill="${fill}" ${line(C.line)}`) + path(inner, `fill="${C.earIn}" ${line(C.earIn, 2)}`);
        };
        const out = lerp(24, 12, G.f);
        const tx = CX + G.brx - 8;
        const ty = G.bcy + G.bry * 0.55;
        const tail = `M${pt(tx, ty)} C${pt(tx + out + 6, ty - 2)} ${pt(tx + out + 10, ty - G.bry * 0.7)} ${pt(tx + out - 4, ty - G.bry)}`;
        const h = G.hcy;
        return {
          behind: path(tail, `fill="none" ${line(C.line, 15)}`) + path(tail, `fill="none" ${line(C.brown, 9.5)}`),
          ears: ear(-1, C.orange) + ear(1, C.brown),
          bodyMarks:
            ellipse(CX - G.brx * 0.74, G.bcy + G.bry * 0.52, G.brx * 0.44, G.bry * 0.42, `fill="${C.brown}"`) +
            ellipse(CX + G.brx * 0.86, G.bcy + G.bry * 0.4, G.brx * 0.34, G.bry * 0.4, `fill="${C.orange}"`),
          headMarks:
            ellipse(CX - G.hrx * 0.62, h - G.hry * 0.78, G.hrx * 0.62, G.hry * 0.66, `fill="${C.orange}"`) +
            ellipse(CX + G.hrx * 0.66, h - G.hry * 0.8, G.hrx * 0.6, G.hry * 0.62, `fill="${C.brown}"`),
          face:
            both((s) =>
              path(
                `M${pt(CX + s * (G.eyeDx + 9), h + 7)} l${s * 15},-2.5 M${pt(CX + s * (G.eyeDx + 9), h + 11.5)} l${s * 15},2`,
                `fill="none" ${line(C.line, 1.6)} opacity=".65"`
              )
            ) +
            path(`M${pt(CX - 3, h + 4.5)} h6 l-3,3.6 Z`, `fill="${C.nose}" ${line(C.nose, 1.5)}`) +
            path(
              `M${pt(CX, h + 8.5)} v2 M${pt(CX - 6.5, h + 10.5)} q3.2,4.2 6.5,0 q3.3,4.2 6.5,0`,
              `fill="none" ${line(C.line, 2)}`
            ),
        };
      },
    },

    dog: {
      colors: { fur: '#EBA85E', belly: '#FFF3DD', line: '#9B5E2A', foot: '#FFF3DD', earIn: '#FCE0B8', nose: '#3B2A22', tongue: '#FF8FA3' },
      head: { rx: [39, 51], ry: [34, 38] },
      eye: { dx: [16, 20], y: -5, r: 4.3 },
      extent: { side: 19, headSide: 4, earUp: 16 },
      draw(G, C) {
        const ear = (s) => {
          const ax = CX + s * G.hrx * 0.62;
          const ay = G.hcy - G.hry * 0.68;
          const d = `M${pt(ax + s * 10, ay + 8)} L${pt(ax + s * 11, ay - 22)} Q${pt(ax + s * 10.5, ay - 25.5)} ${pt(ax + s * 7, ay - 23.5)} L${pt(ax - s * 14, ay - 7)} Z`;
          const inner = `M${pt(ax + s * 6.5, ay + 1)} L${pt(ax + s * 7.3, ay - 15)} L${pt(ax - s * 6, ay - 5.5)} Z`;
          return path(d, `fill="${C.fur}" ${line(C.line)}`) + path(inner, `fill="${C.earIn}" ${line(C.earIn, 2)}`);
        };
        const tcx = CX + G.brx * 0.92 + 4;
        const tcy = G.bcy - G.bry * 0.5;
        const h = G.hcy;
        return {
          // くるんと巻いたしっぽ
          behind:
            ellipse(tcx, tcy, 14, 14, `fill="${C.fur}" ${line(C.line)}`) +
            path(`M${pt(tcx - 5, tcy + 3)} a6.5,6.5 0 1 1 7,4.5`, `fill="none" ${line(C.belly, 3.2)}`),
          ears: both(ear),
          headMarks:
            ellipse(CX, h + 14, G.hrx - 11, G.hry - 17, `fill="${C.belly}"`) +
            both((s) => ellipse(CX + s * (G.eyeDx - 1), h - 14.5, 4, 2.8, `fill="${C.belly}"`)), // まろ眉
          feetMarks: both((s) =>
            path(`M${pt(CX + s * G.footX, G.footY - 2)} v5`, `fill="none" ${line(C.line, 1.6)} opacity=".5"`)
          ),
          face:
            ellipse(CX, h + 19, 3.7, 4.8, `fill="${C.tongue}" ${line(C.line, 1.6)}`) +
            path(
              `M${pt(CX, h + 9)} v4 M${pt(CX - 8, h + 12.5)} q4,5 8,0.6 q4,4.4 8,-0.6`,
              `fill="none" ${line(C.line, 2.2)}`
            ) +
            ellipse(CX, h + 6, 5.4, 4, `fill="${C.nose}"`) +
            ellipse(CX - 1.6, h + 4.8, 1.6, 1, `fill="#fff" opacity=".55"`),
        };
      },
    },

    pig: {
      colors: { fur: '#FBC3CF', belly: '#FDDDE4', line: '#B4546F', foot: '#E68AA2', deep: '#F297AE' },
      head: { rx: [39, 52], ry: [34, 38] },
      eye: { dx: [16, 20], y: -7, r: 4.3 },
      extent: { side: 18, headSide: 6, earUp: 14 },
      draw(G, C) {
        const ear = (s) => {
          const ax = CX + s * G.hrx * 0.6;
          const ay = G.hcy - G.hry * 0.72;
          const d = `M${pt(ax + s * 13, ay + 8)} Q${pt(ax + s * 27, ay - 23)} ${pt(ax + s * 2, ay - 21)} Q${pt(ax - s * 15, ay - 13)} ${pt(ax - s * 12, ay + 3)} Z`;
          const inner = `M${pt(ax + s * 9, ay + 2)} Q${pt(ax + s * 18, ay - 15)} ${pt(ax + s * 3, ay - 14)} Q${pt(ax - s * 7, ay - 9)} ${pt(ax - s * 6, ay + 1)} Z`;
          return path(d, `fill="${C.fur}" ${line(C.line)}`) + path(inner, `fill="${C.deep}"`);
        };
        const tx = CX + G.brx - 3;
        const ty = G.bcy + G.bry * 0.25;
        const tail = `M${pt(tx, ty)} c9,-2 15,3 12,9 c-3,6 -11,3 -8,-3 c2,-4 8,-3 9,1`;
        const sy = G.hcy + 8;
        return {
          behind: path(tail, `fill="none" ${line(C.line, 7.5)}`) + path(tail, `fill="none" ${line(C.deep, 4.2)}`),
          ears: both(ear),
          face:
            ellipse(CX, sy, 14.5, 10.5, `fill="${C.deep}" ${line(C.line, 2.6)}`) +
            both((s) => ellipse(CX + s * 5, sy, 2.3, 3.4, `fill="${C.line}"`)) +
            path(`M${pt(CX - 6, sy + 14.5)} q6,4.5 12,0`, `fill="none" ${line(C.line, 2.4)}`),
        };
      },
    },

    elephant: {
      colors: { fur: '#AEC4DE', belly: '#C9D9EB', line: '#6485AB', earIn: '#F6C6D2', nail: '#F2F6FB' },
      head: { rx: [38, 50], ry: [34, 38] },
      eye: { dx: [17, 21], y: -3, r: 4.2 },
      extent: { side: 19, headSide: 39, earUp: 0 },
      foot: { rx: 15, ry: 9 },
      noChin: true,
      draw(G, C) {
        const h = G.hcy;
        const tx = CX + G.brx - 2;
        const ty = G.bcy + G.bry * 0.35;
        const trunk = `M${pt(CX, h + 9)} C${pt(CX, h + 25)} ${pt(CX - 1, h + 37)} ${pt(CX + 6, h + 40)} S${pt(CX + 15, h + 37)} ${pt(CX + 13, h + 31)}`;
        return {
          behind:
            path(`M${pt(tx, ty)} q13,3 14,15`, `fill="none" ${line(C.line, 3.6)}`) +
            ellipse(tx + 14.5, ty + 18, 3.6, 5.2, `fill="${C.line}"`),
          ears: both((s) => {
            const x = CX + s * (G.hrx + 13);
            const y = h - 3;
            return (
              ellipse(x, y, 23, 29, `fill="${C.fur}" ${line(C.line)}`) +
              ellipse(x + s * 1.5, y + 1, 15, 21, `fill="${C.earIn}"`)
            );
          }),
          feetMarks: both((s) =>
            [-8, 0, 8]
              .map((dx, i) => ellipse(CX + s * G.footX + dx, G.footY + (i === 1 ? 4.5 : 3), 3, 2.2, `fill="${C.nail}"`))
              .join('')
          ),
          front:
            // 鼻：ふちどり用の太い線 → 本体の線 → つけ根をなじませる
            path(trunk, `fill="none" ${line(C.line, 18.5)}`) +
            path(trunk, `fill="none" ${line(C.fur, 13.5)}`) +
            ellipse(CX, h + 5.5, 11, 7.5, `fill="${C.fur}"`) +
            path(
              `M${pt(CX - 5.5, h + 19)} q5.5,2.6 11,0 M${pt(CX - 5.5, h + 26)} q5.5,2.6 11,0`,
              `fill="none" ${line(C.line, 1.6)} opacity=".55"`
            ),
        };
      },
    },
  };

  /* ---------- 組み立て ---------- */
  function render(id, fatness, options) {
    const o = options || {};
    const sp = SPECIES[id] || SPECIES.pig;
    const f = clamp01(fatness);
    const C = sp.colors;
    const G = geometry(f, sp);
    const P = sp.draw(G, C);
    const uid = 'pet' + ++seq;

    const bodyShape = (attrs) => ellipse(CX, G.bcy, G.brx, G.bry, attrs);
    const headShape = (attrs) => ellipse(CX, G.hcy, G.hrx, G.hry, attrs);

    const shadow = ellipse(CX, GROUND - 1, G.brx * 0.95, 7, 'fill="#5B3A1E" opacity=".12"');
    const belly = C.belly ? ellipse(CX, G.bcy + G.bry * 0.14, G.brx * 0.64, G.bry * 0.7, `fill="${C.belly}"`) : '';

    // 太ってくると出てくる「おなかのシワ」
    let folds = '';
    if (f > 0.5) {
      const opacity = n(Math.min(0.6, (f - 0.5) * 1.4));
      const y = G.bcy + G.bry * 0.48;
      folds = both((s) =>
        path(
          `M${pt(CX + s * G.brx * 0.86, y - 4)} q${n(-s * G.brx * 0.08)},8 ${n(-s * G.brx * 0.3)},7`,
          `fill="none" ${line(C.line, 2.2)} opacity="${opacity}"`
        )
      );
    }

    // 二重あご
    let chin = '';
    if (!sp.noChin && f > 0.3) {
      const opacity = n(Math.min(0.6, (f - 0.3) * 1.2));
      chin = path(
        `M${pt(CX - G.hrx * 0.45, G.hcy + G.hry + 3)} q${n(G.hrx * 0.45)},7 ${n(G.hrx * 0.9)},0`,
        `fill="none" ${line(C.line, 2.2)} opacity="${opacity}"`
      );
    }

    const footSize = sp.foot || { rx: 13, ry: 8.5 };
    const feet = both((s) =>
      ellipse(CX + s * G.footX, G.footY, footSize.rx, footSize.ry, `fill="${C.foot || C.fur}" ${line(C.line)}`)
    );

    const arms = sp.noArms
      ? ''
      : both((s) => {
          const x = n(CX + s * (G.brx - lerp(5, 13, f)));
          const y = n(G.bcy - G.bry * 0.18);
          return `<ellipse cx="${x}" cy="${y}" rx="8" ry="13" transform="rotate(${n(-s * lerp(16, 34, f))} ${x} ${y})" fill="${C.fur}" ${line(C.line)}/>`;
        });

    const ey = G.hcy + sp.eye.y;
    const er = sp.eye.r;
    const eyesOpen = both((s) => {
      const x = CX + s * G.eyeDx;
      return (
        ellipse(x, ey, er, er * 1.14, `fill="${EYE}"`) +
        `<circle cx="${n(x - er * 0.3)}" cy="${n(ey - er * 0.42)}" r="${n(er * 0.36)}" fill="#fff"/>`
      );
    });
    // 食べているときの「にっこり目」
    const eyesHappy = both((s) => {
      const x = CX + s * G.eyeDx;
      return path(
        `M${pt(x - er * 1.15, ey + 1.5)} q${n(er * 1.15)},${n(-er * 1.7)} ${n(er * 2.3)},0`,
        `fill="none" ${line(EYE, 2.8)}`
      );
    });
    const blush = both((s) =>
      ellipse(CX + s * (G.eyeDx + 9.5), ey + 10, 6.5, 4, `fill="#FF8FA0" opacity="${n(lerp(0.4, 0.8, f))}"`)
    );

    // 最高レベルのごほうび
    let crown = '';
    if (o.crown) {
      const top = G.hcy - G.hry;
      crown =
        path(
          `M${pt(CX - 15, top + 4)} l-2,-15 l8,7 l9,-11 l9,11 l8,-7 l-2,15 Z`,
          `fill="#FFD24D" ${line('#C98A12', 2.4)}`
        ) + `<circle cx="${CX}" cy="${n(top - 3)}" r="2.2" fill="#FF7A8A"/>`;
    }

    const label = o.label ? `role="img" aria-label="${o.label}"` : 'aria-hidden="true"';

    // fit: 一覧用。体の大きさに合わせて切り抜き、小さい子も見やすくする
    let viewBox = `0 ${VIEW_TOP} 240 ${VIEW_H}`;
    if (o.fit) {
      const half = Math.max(G.brx + sp.extent.side, G.hrx + sp.extent.headSide) + 4;
      const size = Math.max(half * 2, GROUND + 8 - (topY(G, sp, o.crown) - 4));
      viewBox = `${n(CX - size / 2)} ${n(GROUND + 8 - size)} ${n(size)} ${n(size)}`;
    }

    return (
      `<svg class="pet-svg" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" ${label}>` +
      `<defs><clipPath id="${uid}b">${bodyShape('')}</clipPath><clipPath id="${uid}h">${headShape('')}</clipPath></defs>` +
      shadow +
      '<g class="pet-all">' +
      (P.behind || '') +
      bodyShape(`fill="${C.fur}"`) +
      `<g clip-path="url(#${uid}b)">${P.bodyMarks || ''}${belly}</g>` +
      bodyShape(`fill="none" ${line(C.line)}`) +
      folds +
      feet +
      (P.feetMarks || '') +
      arms +
      (P.ears || '') +
      headShape(`fill="${C.fur}"`) +
      `<g clip-path="url(#${uid}h)">${P.headMarks || ''}</g>` +
      headShape(`fill="none" ${line(C.line)}`) +
      chin +
      blush +
      `<g class="pet-eyes-open">${eyesOpen}</g><g class="pet-eyes-happy">${eyesHappy}</g>` +
      (P.face || '') +
      (P.front || '') +
      crown +
      '</g></svg>'
    );
  }

  /* 耳や王冠をふくめた「いちばん上」のy座標 */
  function topY(G, sp, crown) {
    return G.hcy - G.hry - Math.max(sp.extent.earUp, crown ? 17 : 0);
  }

  /* 口と頭のてっぺんの位置（絵の中での割合 0〜1）。
   * 食べ物が飛んでいく先と、ふきだしを出す高さに使う */
  function layout(id, fatness, options) {
    const sp = SPECIES[id] || SPECIES.pig;
    const G = geometry(clamp01(fatness), sp);
    return {
      mouth: { x: 0.5, y: (G.hcy + 12 - VIEW_TOP) / VIEW_H },
      top: (topY(G, sp, options && options.crown) - VIEW_TOP) / VIEW_H,
    };
  }

  return { render, layout };
})();
