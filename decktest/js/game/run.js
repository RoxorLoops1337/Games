// Run state: the persistent state of a single roguelike run.
// - round: 1..MAX_ROUND
// - lives: HP for the run (lose 1 per defeat)
// - gold: shop currency
// - bench: array of unit defIds the player owns but hasn't placed
// - board: array of {defId, col, row} placed on the player half (cols 0..3)
window.Decktest = window.Decktest || {};

(function () {
  const STARTING_GOLD = 8;
  const STARTING_LIVES = 4;
  const MAX_ROUND = 8;
  const MAX_BENCH = 6;
  const MAX_BOARD = 6;
  const PLAYER_COLS = [0, 1, 2, 3];
  const REROLL_COST = 2;
  const SELL_REFUND = 1;

  // Income per round-end: base + win bonus.
  function roundIncome(won, round) {
    return 4 + (won ? 2 : 0) + Math.floor(round / 2);
  }

  function makeRun() {
    return {
      round: 1,
      lives: STARTING_LIVES,
      gold: STARTING_GOLD,
      bench: [],          // [defId, ...]
      board: [],          // [{defId, col, row}, ...]
      shop: [],           // [defId | null, ...]  null means bought
      shopLocked: false,
      runOver: false,
      victory: false,
    };
  }

  function benchHasRoom(run) { return run.bench.length < MAX_BENCH; }
  function boardHasRoom(run) { return run.board.length < MAX_BOARD; }

  function isPlayerCell(col) { return PLAYER_COLS.includes(col); }
  function cellOccupied(run, col, row) {
    return run.board.some(p => p.col === col && p.row === row);
  }

  function placeFromBench(run, benchIdx, col, row) {
    if (!isPlayerCell(col)) return false;
    if (cellOccupied(run, col, row)) return false;
    if (!boardHasRoom(run)) return false;
    if (benchIdx < 0 || benchIdx >= run.bench.length) return false;
    const defId = run.bench[benchIdx];
    run.bench.splice(benchIdx, 1);
    run.board.push({ defId, col, row });
    return true;
  }

  function returnToBench(run, boardIdx) {
    if (!benchHasRoom(run)) return false;
    if (boardIdx < 0 || boardIdx >= run.board.length) return false;
    const piece = run.board[boardIdx];
    run.board.splice(boardIdx, 1);
    run.bench.push(piece.defId);
    return true;
  }

  function sellFromBench(run, benchIdx) {
    if (benchIdx < 0 || benchIdx >= run.bench.length) return false;
    run.bench.splice(benchIdx, 1);
    run.gold += SELL_REFUND;
    return true;
  }

  function sellFromBoard(run, boardIdx) {
    if (boardIdx < 0 || boardIdx >= run.board.length) return false;
    run.board.splice(boardIdx, 1);
    run.gold += SELL_REFUND;
    return true;
  }

  function endRound(run, won) {
    if (won) {
      run.gold += roundIncome(true, run.round);
      run.round += 1;
      if (run.round > MAX_ROUND) {
        run.runOver = true;
        run.victory = true;
      }
    } else {
      run.lives -= 1;
      run.gold += roundIncome(false, run.round);
      if (run.lives <= 0) {
        run.runOver = true;
        run.victory = false;
      } else {
        run.round += 1;
        if (run.round > MAX_ROUND) {
          run.runOver = true;
          run.victory = false;
        }
      }
    }
  }

  Decktest.run = {
    STARTING_GOLD, STARTING_LIVES, MAX_ROUND, MAX_BENCH, MAX_BOARD,
    PLAYER_COLS, REROLL_COST, SELL_REFUND,
    makeRun,
    benchHasRoom, boardHasRoom, isPlayerCell, cellOccupied,
    placeFromBench, returnToBench, sellFromBench, sellFromBoard,
    endRound, roundIncome,
  };
})();
