#!/usr/bin/env node
/**
 * 国标掼蛋规则回归：从 public/guandan.html 抽出纯函数并断言。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/guandan.html'), 'utf8');
const m = html.match(/<script>\s*const \{ createApp[\s\S]*?(?=const app = createApp)/);
if (!m) {
    console.error('FAIL: cannot extract rules script');
    process.exit(1);
}
const src = m[0]
    .replace(/^<script>\s*/, '')
    .replace(/const \{ createApp[\s\S]*?\} = Vue;/, '');

const sandbox = {
    window: {
        AudioContext: null,
        webkitAudioContext: null,
        speechSynthesis: null,
        __gdSettings: { singCards: false, soundFx: false },
        __gdRules: null
    },
    navigator: { userAgent: 'node' },
    console,
    setTimeout,
    clearTimeout,
    speechSynthesis: null
};
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.__gdRules = window.__gdRules;', sandbox);
const R = sandbox.window.__gdRules || sandbox.__gdRules;
if (!R) {
    console.error('FAIL: window.__gdRules missing');
    process.exit(1);
}

function C(suit, rank, id) {
    return { suit, rank, id: id || (rank + suit) };
}
function many(suit, rank, n) {
    return Array.from({ length: n }, (_, i) => C(suit, rank, rank + suit + i));
}

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
    if (cond) { passed++; }
    else { failed++; console.error('FAIL', name, detail || ''); }
}
function eq(name, a, b) {
    ok(name, a === b, JSON.stringify({ a, b }));
}

eq('cardValue 3', R.cardValue(C('♠', '3'), '5'), 3);
eq('cardValue A', R.cardValue(C('♠', 'A'), '5'), 14);
eq('cardValue 2 is 15', R.cardValue(C('♠', '2'), '5'), 15);
eq('cardValue 级牌', R.cardValue(C('♠', '5'), '5'), 98);
eq('cardValue 小王', R.cardValue(C('🃏', '小王'), '5'), 99);
eq('cardValue 大王', R.cardValue(C('🃏', '大王'), '5'), 100);

eq('single', R.parsePlay([C('♠', '7')], '2').type, 'single');
eq('pair', R.parsePlay([C('♠', '7'), C('♥', '7')], '2').type, 'pair');
eq('triple', R.parsePlay(many('♠', '8', 3), '2').type, 'triple');
eq('bomb4', R.parsePlay(many('♠', '9', 4), '2').type, 'bomb');
eq('bomb4 len', R.parsePlay(many('♠', '9', 4), '2').length, 4);

const kings = [C('🃏', '大王', 'B1'), C('🃏', '大王', 'B2'), C('🃏', '小王', 'S1'), C('🃏', '小王', 'S2')];
eq('四大天王', R.parsePlay(kings, '2').type, 'fourKings');

const a2345 = [C('♠', 'A'), C('♥', '2'), C('♣', '3'), C('♦', '4'), C('♠', '5')];
eq('A2345 顺子', R.parsePlay(a2345, '7').type, 'straight');
const tjqka = [C('♠', '10'), C('♥', 'J'), C('♣', 'Q'), C('♦', 'K'), C('♠', 'A')];
eq('10JQKA 顺子', R.parsePlay(tjqka, '7').type, 'straight');
const qka23 = [C('♠', 'Q'), C('♥', 'K'), C('♣', 'A'), C('♦', '2'), C('♠', '3')];
eq('QKA23 非法', R.parsePlay(qka23, '7').type, 'invalid');

const wood = [C('♠', '3'), C('♥', '3'), C('♣', '4'), C('♦', '4'), C('♠', '5'), C('♥', '5')];
eq('木板334455', R.parsePlay(wood, '7').type, 'threePair');
const woodA = [C('♠', 'A'), C('♥', 'A'), C('♣', '2'), C('♦', '2'), C('♠', '3'), C('♥', '3')];
eq('木板AA2233 A作1', R.parsePlay(woodA, '7').type, 'threePair');
const woodQKA = [C('♠', 'Q'), C('♥', 'Q'), C('♣', 'K'), C('♦', 'K'), C('♠', 'A'), C('♥', 'A')];
eq('木板QQKKAA', R.parsePlay(woodQKA, '7').type, 'threePair');
const woodWrap = [C('♠', 'K'), C('♥', 'K'), C('♣', 'A'), C('♦', 'A'), C('♠', '2'), C('♥', '2')];
eq('木板KAA22 非法绕圈', R.parsePlay(woodWrap, '7').type, 'invalid');

const steel = [...many('♠', '3', 3), ...many('♥', '4', 3)];
eq('钢板333444', R.parsePlay(steel, '7').type, 'steelPlate');
const steelA = [...many('♠', 'A', 3), ...many('♥', '2', 3)];
eq('钢板AAA222 A作1', R.parsePlay(steelA, '7').type, 'steelPlate');

const sf = [C('♥', '5'), C('♥', '6'), C('♥', '7'), C('♥', '8'), C('♥', '9')];
eq('同花顺', R.parsePlay(sf, '2').type, 'straightFlush');
const bomb4 = many('♠', '8', 4);
const bomb5 = many('♠', '8', 5);
const bomb6 = many('♠', '8', 6);
ok('4炸压普通', R.canBeatCurrent(R.parsePlay(bomb4, '2'), R.parsePlay([C('♠', 'A')], '2')));
ok('同花顺压4炸', R.canBeatCurrent(R.parsePlay(sf, '2'), R.parsePlay(bomb4, '2')));
ok('5炸压不过同花顺', !R.canBeatCurrent(R.parsePlay(bomb5, '2'), R.parsePlay(sf, '2')));
ok('同花顺压5炸', R.canBeatCurrent(R.parsePlay(sf, '2'), R.parsePlay(bomb5, '2')));
ok('6炸压同花顺', R.canBeatCurrent(R.parsePlay(bomb6, '2'), R.parsePlay(sf, '2')));
ok('天王压6炸', R.canBeatCurrent(R.parsePlay(kings, '2'), R.parsePlay(bomb6, '2')));
ok('对A压不过对2', !R.canBeatCurrent(
    R.parsePlay([C('♠', 'A'), C('♥', 'A')], '5'),
    R.parsePlay([C('♠', '2'), C('♥', '2')], '5')
));
ok('对2压对A', R.canBeatCurrent(
    R.parsePlay([C('♠', '2'), C('♥', '2')], '5'),
    R.parsePlay([C('♠', 'A'), C('♥', 'A')], '5')
));

const wildPair = [C('♥', '5', 'w1'), C('♠', '9'), C('♣', '9')];
eq('逢人配三张', R.parsePlay(wildPair, '5').type, 'triple');

eq('bump 2+3=5', R.bumpTeamLevel('2', 3), '5');
eq('bump K+3 不可跳A', R.bumpTeamLevel('K', 3), 'A');
eq('bump Q+3=A', R.bumpTeamLevel('Q', 3), 'A');
eq('bump A+2=A', R.bumpTeamLevel('A', 2), 'A');

const doubleUp = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentA'],
    bankerTeam: 'player', currentLevel: '2',
    playerLevel: '2', oppLevel: '2', playerRushA: 1, oppRushA: 1
});
eq('双上升3', doubleUp.upgradeLevels, 3);
eq('双上后打5', doubleUp.currentLevel, '5');
eq('双上双贡', doubleUp.isDoubleDown, true);
eq('双下两人进贡', !!doubleUp.tribute.loser2, true);

const singleUp = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentB', 'opponentA'],
    bankerTeam: 'player', currentLevel: '2',
    playerLevel: '2', oppLevel: '2', playerRushA: 1, oppRushA: 1
});
eq('单上升2', singleUp.upgradeLevels, 2);
eq('单上后打4', singleUp.currentLevel, '4');
eq('单上单贡', singleUp.isDoubleDown, false);

const lastUp = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentB', 'opponentC', 'opponentA'],
    bankerTeam: 'player', currentLevel: '2',
    playerLevel: '2', oppLevel: '2', playerRushA: 1, oppRushA: 1
});
eq('头游末游升1', lastUp.upgradeLevels, 1);
eq('头游末游后打3', lastUp.currentLevel, '3');

const passA12 = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentA'],
    bankerTeam: 'player', currentLevel: 'A',
    playerLevel: 'A', oppLevel: '7', playerRushA: 1, oppRushA: 1
});
eq('头游二游过A', passA12.passedA, true);
eq('过A结束整局', passA12.matchOver, true);

const passA13 = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentB', 'opponentA'],
    bankerTeam: 'player', currentLevel: 'A',
    playerLevel: 'A', oppLevel: '7', playerRushA: 1, oppRushA: 1
});
eq('头游三游过A', passA13.passedA, true);

const failA14 = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentB', 'opponentC', 'opponentA'],
    bankerTeam: 'player', currentLevel: 'A',
    playerLevel: 'A', oppLevel: '7', playerRushA: 1, oppRushA: 1
});
eq('头游末游不过A', failA14.passedA, false);
eq('不过A仍打A', failA14.currentLevel, 'A');
eq('不过A记A2', failA14.playerRushA, 2);

const failANotHead = R.applyRoundOutcome({
    finishSeats: ['opponentB', 'opponentC'],
    bankerTeam: 'player', currentLevel: 'A',
    playerLevel: 'A', oppLevel: '7', playerRushA: 1, oppRushA: 1
});
eq('打A方未获上游不过A', failANotHead.passedA, false);
eq('对方打级升3', failANotHead.currentLevel, R.bumpTeamLevel('7', 3));
eq('己方冲A记A2', failANotHead.playerRushA, 2);

const a3fail = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentB', 'opponentC', 'opponentA'],
    bankerTeam: 'player', currentLevel: 'A',
    playerLevel: 'A', oppLevel: '7', playerRushA: 3, oppRushA: 1
});
eq('A3未过退回2', a3fail.playerLevel, '2');
eq('退回后打2', a3fail.currentLevel, '2');
eq('A3回退不叠加升级', a3fail.playerRushA, 1);

const notBankerA = R.applyRoundOutcome({
    finishSeats: ['player', 'opponentA'],
    bankerTeam: 'opp', currentLevel: '7',
    playerLevel: 'A', oppLevel: '7', playerRushA: 1, oppRushA: 1
});
eq('非打级方双上不能过A', notBankerA.passedA, false);
eq('己方A保持A下副打A', notBankerA.currentLevel, 'A');

const cBig = C('♠', 'A', 'a');
const cSmall = C('♥', '3', 'b');
const pairT = R.pairDoubleTribute('opponentB', cBig, 'opponentC', cSmall, 'player', 'opponentA', '5', R.SEATS_CW);
eq('双贡大牌给头游', pairT.pairs[0].to, 'player');
eq('双贡大牌来自B', pairT.pairs[0].from, 'opponentB');
eq('双贡小牌给二游', pairT.pairs[1].to, 'opponentA');
eq('双贡先出是贡大牌者', pairT.leadSeat, 'opponentB');

const eqPair = R.pairDoubleTribute(
    'opponentB', C('♠', 'K', 'k1'), 'opponentC', C('♥', 'K', 'k2'),
    'player', 'opponentA', '5', R.SEATS_CW
);
eq('贡牌相同顺时针头游下家先贡', eqPair.pairs[0].from, 'opponentC');
eq('相同点数先出下家', eqPair.leadSeat, 'opponentC');

ok('抗贡双大王', R.checkAntiTribute(['opponentB'], { opponentB: [C('🃏', '大王', '1'), C('🃏', '大王', '2')] }));
ok('双贡两人各一大王抗贡', R.checkAntiTribute(
    ['opponentB', 'opponentC'],
    { opponentB: [C('🃏', '大王', '1')], opponentC: [C('🃏', '大王', '2')] }
));
ok('单贡一张大王不抗', !R.checkAntiTribute(['opponentB'], { opponentB: [C('🃏', '大王', '1')] }));

ok('还贡10可以', R.isReturnableByPoint(C('♠', '10')));
ok('还贡J不行', !R.isReturnableByPoint(C('♠', 'J')));
ok('还贡王不行', !R.isReturnableByPoint(C('🃏', '大王')));
const retPool = R.getReturnableCards([C('♠', 'K'), C('♥', 'Q'), C('♣', 'A')]);
eq('全大于10则允许还最小集合', retPool.length, 3);
const retPick = R.pickSmallestReturn([C('♠', '3'), C('♥', 'K'), C('♣', 'A')], '5');
eq('有≤10还最小3', retPick.rank, '3');

const wild = C('♥', '5', 'w');
const maxT = R.tributeMaxCard([wild, C('♠', 'A'), C('♣', 'K')], '5');
eq('进贡排除逢人配', maxT.rank, 'A');

const jie = R.nextLeaderAfterPasses('player', { player: 0, opponentA: 10, opponentB: 8, opponentC: 9 });
eq('接风给对家', jie.seat, 'opponentA');
eq('接风kind', jie.kind, 'jie_feng');
const cont = R.nextLeaderAfterPasses('player', { player: 5, opponentA: 10, opponentB: 8, opponentC: 9 });
eq('三人过后原出牌者继续', cont.kind, 'continue');
eq('下家轮转', R.nextActiveSeat('player', { player: 5, opponentC: 5, opponentA: 5, opponentB: 5 }), 'opponentC');
eq('跳过出完的人', R.nextActiveSeat('player', { player: 0, opponentC: 0, opponentA: 8, opponentB: 9 }), 'opponentA');

eq('rushLabel A2', R.rushLabel('A', 2), 'A2');
eq('rushLabel 5', R.rushLabel('5', 2), '5');

console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
