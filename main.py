""""""
# https://replit.com/talk/ask/Heroku-CLI/19230

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
from uuid import uuid4
from datetime import datetime
from random import randint


app = FastAPI()
origins = [
  'https://beta.kamiak.org/battleship'
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
games = {}
events = {}


@app.get('/', response_class=HTMLResponse)
async def home(request: Request):
  return 'up'

class Game():
  __slots__ = 'last_active', 'players', 'move'
  def __init__(self):
    self.last_active = int(datetime.now().timestamp())
    self.players = []
    self.move = None

class Player():
  __slots__ = 'uuid', 'setup', 'board', 'ships'
  def __init__(self, uuid, setup):
    self.uuid = uuid
    self.setup = setup
    self.board = [[0]*10 for n in range(10)]
    self.ships = ''  # Eliminated ships btw



def p(board):
  b = [[0]*10 for _ in range(10)]
  for y, x in board.keys():
    print(y, x)
    b[y][x] = 1
  print('\n'.join(' '.join(str(_) for _ in row) for row in b)+'\n')


def verify_setup(setup):
  try:
    board = {}
    for x, y, rotation, length in zip(*[iter(map(int, setup))]*3, [2, 3, 3, 4, 5]):
      if rotation == 0:
        assert y < 10 and x+length-1 < 10
        for n in range(length):
          assert (y, x+n) not in board
          board[y, x+n] = None
      else:
        assert y+length-1 < 10 and x < 10
        for n in range(length):
          assert (y+n, x) not in board
          board[y+n, x] = None
    p(board)
    return True
  except:
    p(board)
    return False
# 000010200310900


@app.post('/api/join', response_class=JSONResponse)
async def join(request: Request):
  # https://stackoverflow.com/questions/18697034/how-to-pass-parameters-in-ajax-post/35590754

  json = await request.json()
  print(json)
  assert 'setup' in json
  setup = json['setup']
  uuid = uuid4().fields[-1]
  # -1: invalid setup
  # 0 : first player, send response to wait
  # 1 : second player

  if len(games) != 0 and len(list(games.values())[-1].players) < 2:
    game_id = list(games.keys())[-1]
  else:
    game_id = uuid4().fields[-1]
    games[game_id] = Game()
  game = games[game_id]

  if not verify_setup(setup):
    return JSONResponse({}, 400)

  if len(game.players) == 0:
    game.players.append(Player(uuid, setup))
    events[game_id] = asyncio.Event()
    return JSONResponse({'game': game_id, 'uuid': uuid, 'players': 1}, 201)

  order = randint(0, 1)
  game.players.insert(order, Player(uuid, setup))

  events[game_id].set()

  return JSONResponse({'game': game_id, 'uuid': uuid, 'players': 2, 'turn': bool(1-order)}, 201)


@app.post('/api/wait', response_class=JSONResponse)
async def wait_(request: Request):
  json = await request.json()
  print(json)
  assert 'game' in json and 'uuid' in json
  game_id = json['game']
  uuid = json['uuid']

  game = games[game_id]
  assert game.players[0].uuid == uuid  # MAYBE REMOVE
  player = game.players[0]

  try:
    await asyncio.wait_for(events[game_id].wait(), timeout=2)
    events[game_id] = asyncio.Event()
    return {'success': True, 'turn': player is game.players[0]}
  except asyncio.TimeoutError:
    del games[game_id]
    return {'success': False}


@app.post('/api/play', response_class=JSONResponse)
async def play(request: Request):
  json = await request.json()
  # print(json)
  assert 'game' in json and 'uuid' in json and 'move' in json
  game_id = json['game']
  uuid = json['uuid']
  move = json['move']
  game = games[game_id]
  player = game.players[0]
  opponent = game.players[1]
  assert len(opponent.ships) != 20  # Game must not be over
  if player.uuid != uuid:
    print(player.uuid, '!=', uuid)
    game.players[0], game.players[1], player, opponent = game.players[1], game.players[0], opponent, player
    # return
  # assert player.uuid == uuid  # idk about remove maybe
  print(move)
  x, y = map(int, move)
  # print(opponent.board)
  if opponent.board[y][x] != 0: return HTMLResponse('', 400)
  for i, sx, sy, rotation, length in zip(range(5), *[iter(map(int, opponent.setup))]*3, [2, 3, 3, 4, 5]):
    if rotation == 0:
      # Hit an x ship
      if sx <= x < sx+length and sy == y:
        print('hit')
        opponent.board[y][x] = 2
        if all(opponent.board[sy][sx+n] == 2 for n in range(length)):
          opponent.ships += str(i)+opponent.setup[i*3:(i+1)*3]
        break
    else:
      # Hit a y ship
      if sx == x and sy <= y < sy+length:
        print('hit')
        opponent.board[y][x] = 2
        if all(opponent.board[sy+n][sx] == 2 for n in range(length)):
          opponent.ships += str(i)+opponent.setup[i*3:(i+1)*3]
        break
  else: opponent.board[y][x] = 1

  game.move = move, opponent.board[y][x]
  print('\n'.join(' '.join(str(_) for _ in row) for row in opponent.board))

  events[game_id].set()
  game.last_active = int(datetime.now().timestamp())

  # return {'move': game.move, 'board': opponent.board, 'ships': opponent.ships}
  return {'move': game.move, 'ships': opponent.ships}


@app.post('/api/view', response_class=JSONResponse)
async def view(request: Request):
  json = await request.json()
  # print(json)
  assert 'game' in json and 'uuid' in json
  game_id = json['game']
  uuid = json['uuid']
  game = games[game_id]
  player = game.players[0]
  opponent = game.players[1]
  assert len(opponent.ships) != 20  # Game must not be over
  if opponent.uuid != uuid:
    print(opponent.uuid, '!=', uuid)
    game.players[0], game.players[1], player, opponent = game.players[1], game.players[0], opponent, player
    # return
  # assert opponent.uuid == uuid  # maybe remove NAHHH

  await events[game_id].wait()
  events[game_id] = asyncio.Event()
  game.players[0], game.players[1] = game.players[1], game.players[0]

  # return {'move': game.move, 'board': opponent.board, 'ships': opponent.ships}
  if len(opponent.ships) != 20:
    return {'move': game.move, 'ships': opponent.ships}
  else:
    return {
      'move': game.move,
      'ships': opponent.ships,
      'hiddenShips': ''.join([str(i)+player.setup[i*3:(i+1)*3] for i in set(range(5)).difference(set(map(int, player.ships[::4])))])
    }


# async def app(scope, receive, send):
#   """The simplest of ASGI apps, displaying scope."""
#   headers = [(b"content-type", b"text/html")]
#   body = pretty_html_bytes(scope)
#   await asyncio.sleep(1)
#   await send({"type": "http.response.start", "status": 200, "headers": headers})
#   await send({"type": "http.response.body", "body": body})


from threading import Thread
def a():
  while True:
    try:
      print(globals()[input()])
    except Exception as e:
      print(e);
    # print(verify_setup(input()))
t = Thread(target=a)
t.daemon=True
t.start()

if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=80)

# https://www.uvicorn.org/
# https://github.com/tiangolo/fastapi
# Don't forget to add to UptimeRobot! (after changing domain oc)