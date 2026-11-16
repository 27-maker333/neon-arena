/** Deterministic Neon Blast engine shared by web and Supabase function. */
export const GRID_SIZE=8;
export const COLOR_COUNT=5;
export const GAME_DURATION_MS=60_000;
export const MAX_MOVES=120;
export type Move={index:number;atMs:number};
export type State={grid:number[];rng:number;score:number;moves:number};

function nextRandom(seed:number):number {
 let x=seed>>>0; x^=x<<13; x^=x>>>17; x^=x<<5; return x>>>0;
}
function pickColor(state:State):number {
 state.rng=nextRandom(state.rng); return state.rng%COLOR_COUNT;
}
export function initialState(seed:number):State {
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff) throw new Error('Invalid seed');
 const state:State={grid:Array(GRID_SIZE*GRID_SIZE).fill(0),rng:seed>>>0,score:0,moves:0};
 for(let i=0;i<state.grid.length;i++) state.grid[i]=pickColor(state);
 return state;
}
export function applyMove(previous:State,index:number):{state:State;removed:number} {
 if(!Number.isInteger(index)||index<0||index>=GRID_SIZE*GRID_SIZE) throw new Error('Invalid cell');
 const state:State={...previous,grid:[...previous.grid]};
 const target=state.grid[index];
 const seen=new Set<number>([index]),stack=[index];
 while(stack.length){
  const p=stack.pop()!,row=Math.floor(p/GRID_SIZE),col=p%GRID_SIZE;
  const adjacent=[
   ...(row>0?[p-GRID_SIZE]:[]),
   ...(row<GRID_SIZE-1?[p+GRID_SIZE]:[]),
   ...(col>0?[p-1]:[]),
   ...(col<GRID_SIZE-1?[p+1]:[])
  ];
  for(const next of adjacent) if(!seen.has(next)&&state.grid[next]===target){seen.add(next);stack.push(next);}
 }
 if(seen.size<3) return {state:previous,removed:0};
 for(const p of seen) state.grid[p]=-1;
 for(let col=0;col<GRID_SIZE;col++){
  const survivors:number[]=[];
  for(let row=GRID_SIZE-1;row>=0;row--){
   const color=state.grid[row*GRID_SIZE+col];if(color>=0) survivors.push(color);
  }
  let writeRow=GRID_SIZE-1;
  for(const color of survivors) state.grid[writeRow--*GRID_SIZE+col]=color;
  while(writeRow>=0) state.grid[writeRow--*GRID_SIZE+col]=pickColor(state);
 }
 state.score+=seen.size*10+Math.max(0,seen.size-3)**2*5;
 state.moves+=1;
 return {state,removed:seen.size};
}
export function replay(seed:number,moves:Move[]):State {
 if(!Array.isArray(moves)||moves.length>MAX_MOVES) throw new Error('Invalid move count');
 let state=initialState(seed),previousTime=-150;
 for(const move of moves){
  if(!move||!Number.isInteger(move.atMs)||!Number.isInteger(move.index)) throw new Error('Invalid move format');
  if(move.atMs>GAME_DURATION_MS||move.atMs<0||move.atMs-previousTime<150) throw new Error('Invalid move timing');
  const result=applyMove(state,move.index);
  if(result.removed<3) throw new Error('Invalid combination');
  state=result.state;previousTime=move.atMs;
 }
 return state;
}
