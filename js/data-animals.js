/* =========================================================
 * どうぶつデータ
 *
 * dailyKcal … おとなの個体が1日に必要とするエネルギー（体重を保つための目安）
 *
 * 太る速さのルール：
 *   ごはん何日分か ＝ がまんしたカロリー ÷ dailyKcal
 * なので、必要カロリーが小さい動物ほど早く太ります。
 * 数値を変えたいときは dailyKcal を書きかえるだけでOKです。
 * ========================================================= */
'use strict';

const ANIMALS = [
  {
    id: 'hamster',
    name: 'ハムスター',
    emoji: '🐹',
    defaultName: 'ハムすけ',
    dailyKcal: 30,
    model: 'ゴールデンハムスター（おとな・約120g）',
    formula: 'おとなの摂取エネルギーの実測値 27〜29 kcal/日 から、約30 kcal',
    source: 'NRC「Nutrient Requirements of Laboratory Animals」第4版 (1995)',
    sourceUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK231928/',
    pace: 'すぐ太る',
    tint: '#FFE9C2',
    voice: {
      hungry: ['ほっぺが からっぽだよ…', 'タネより ケーキが いいな'],
      fed: ['ほっぺに ためとくね！', 'もぐもぐ…しあわせ〜'],
      full: ['ころがったほうが はやいかも', 'ほっぺ、もう ぱんぱん！'],
    },
  },
  {
    id: 'cat',
    name: 'ネコ',
    emoji: '🐱',
    defaultName: 'ミケ',
    dailyKcal: 240,
    model: 'おとなのネコ（体重4kg・避妊去勢済み）',
    formula: '70 × 4kg^0.75 × 1.2 ≒ 238 kcal',
    source: '安静時エネルギー要求量(RER)×係数1.2（Pet Nutrition Alliance）',
    sourceUrl: 'https://petnutritionalliance.org/wp-content/uploads/2023/03/MER.RER_.PNA_.pdf',
    pace: '太りやすい',
    tint: '#FFE6DC',
    voice: {
      hungry: ['…おなか すいたニャ', 'がまんしたやつ、よこすニャ'],
      fed: ['わるくないニャ', '…もっと あってもいいニャ'],
      full: ['うごきたくないニャ…', 'だっこは おもいから やめとくニャ'],
    },
  },
  {
    id: 'dog',
    name: 'イヌ',
    emoji: '🐶',
    defaultName: 'まめ',
    dailyKcal: 630,
    model: 'おとなのイヌ（柴犬くらい・体重10kg・避妊去勢済み）',
    formula: '70 × 10kg^0.75 × 1.6 ≒ 630 kcal',
    source: '安静時エネルギー要求量(RER)×係数1.6（Pet Nutrition Alliance）',
    sourceUrl: 'https://petnutritionalliance.org/wp-content/uploads/2023/03/MER.RER_.PNA_.pdf',
    pace: 'ふつう',
    tint: '#FFE3C4',
    voice: {
      hungry: ['ごはん まだ？ ごはん まだ？', 'がまんしたら ボクに ちょうだい！'],
      fed: ['わーい！ ごちそうさま！', 'しっぽが とまらないワン！'],
      full: ['おさんぽは…あしたでも いい？', 'おなかが じめんに つきそうワン'],
    },
  },
  {
    id: 'pig',
    name: 'ブタ',
    emoji: '🐷',
    defaultName: 'ぶーちゃん',
    dailyKcal: 5300,
    model: 'おとなのブタ（体重200kg）',
    formula: '100 × 200kg^0.75 ≒ 5,300 kcal',
    source: 'NRC「Nutrient Requirements of Swine」(2012) の維持エネルギー式',
    sourceUrl: 'https://gb.pic.com/resources/do-todays-sows-receive-a-sufficient-daily-amount-of-energy-to-meet-their-maintenance-needs',
    pace: 'じっくり',
    tint: '#FFDDE4',
    voice: {
      hungry: ['ブー…はらぺこだブー', 'なんでも たべるブー！'],
      fed: ['ブヒッ！ うまいブー！', 'おかわり あるブー？'],
      full: ['まんぷくだブ〜…でも べつばらブー', 'りっぱな からだに なったブー'],
    },
  },
  {
    id: 'elephant',
    name: 'ゾウ',
    emoji: '🐘',
    defaultName: 'パオ',
    dailyKcal: 58000,
    model: 'おとなのアジアゾウ（体重3,000kg）',
    formula: '143 × 3,000kg^0.75 ≒ 58,000 kcal',
    source: 'Clauss ら (2005) の維持エネルギー推定式（動物園ゾウの栄養研究）',
    sourceUrl: 'https://nagonline.net/wp-content/uploads/2016/02/12_Carneiro.pdf',
    pace: '超じっくり',
    tint: '#DCE9F7',
    voice: {
      hungry: ['ぜんぜん たりないゾウ…', 'ケーキ1こ？ ひとくちだゾウ'],
      fed: ['ありがとうだゾウ！', 'すこしずつでも うれしいゾウ'],
      full: ['ずっしり してきたゾウ', 'じめんが ゆれるゾウ〜'],
    },
  },
];

/* =========================================================
 * レベル（太り具合）
 *  days … そのレベルになるのに必要な「ごはん何日分」
 *  全どうぶつ共通。必要カロリーが違うので、到達の早さが変わります。
 * ========================================================= */
const LEVELS = [
  { days: 0, title: 'ほっそり', goal: '' },
  { days: 0.1, title: 'ふつう', goal: 'ごはん1日分の10%' },
  { days: 0.5, title: 'ちょいぽちゃ', goal: 'ごはん半日分' },
  { days: 1, title: 'ぽっちゃり', goal: 'ごはん1日分' },
  { days: 3, title: 'むっちり', goal: 'ごはん3日分' },
  { days: 7, title: 'まるまる', goal: 'ごはん1週間分' },
  { days: 14, title: 'どっしり', goal: 'ごはん2週間分' },
  { days: 30, title: 'でっぷり', goal: 'ごはん1か月分' },
  { days: 100, title: 'まんまる', goal: 'ごはん100日分' },
  { days: 365, title: '伝説のまんまる', goal: 'ごはん1年分' },
];

/* 体脂肪1kgあたりのカロリー（よく使われる目安） */
const KCAL_PER_KG_FAT = 7200;
