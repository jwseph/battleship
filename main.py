import socketio
import uvicorn
from uuid import uuid4
from random import randint


origins = [
  'https://kamiak.org',
  'https://beta.kamiak.org',
  'https://battleship-heroku.herokuapp.com',
  'https://kamiakhs.github.io',
  'https://battleship.kamiak.org',
  'http://localhost',
]
files = {
  '/': 'public/'
}
socket = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=origins)
app = socketio.ASGIApp(socket, static_files=files, socketio_path='/battleship/socket.io')

games = {}


class Game():
  __slots__ = 'players', 'move'
  def __init__(self):
    self.players = []
    self.move = None

class Player():
  __slots__ = 'sid', 'setup', 'board', 'ships'
  def __init__(self, sid, setup):
    self.sid = sid
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


@socket.event
async def connect(sid, environ):
  print(sid, 'connected')


@socket.event
async def disconnect(sid):
  print(sid, 'disconnected')
  for game_id, game in list(games.items()):
    for i in range(len(game.players)):
      if sid == game.players[i].sid:
        if len(game.players) > 1: await socket.emit('opponent disconnect', to=game.players[1-i].sid)
        del games[game_id]
        return


@socket.event
async def join(sid, data):
  # https://stackoverflow.com/questions/18697034/how-to-pass-parameters-in-ajax-post/35590754

  assert 'setup' in data
  setup = data['setup']

  if len(games) != 0 and len(list(games.values())[-1].players) < 2:
    game_id = list(games.keys())[-1]
  else:
    game_id = uuid4().fields[-1]
    games[game_id] = Game()
  game = games[game_id]

  if not verify_setup(setup):
    return {'success': False}  # invalid setup, user is editing dom

  if len(game.players) == 0:
    game.players.append(Player(sid, setup))
    return {'success': True, 'game': game_id, 'sid': sid, 'players': 1}

  order = randint(0, 1)
  await socket.emit('opponent join', {'turn': order == 1}, to=game.players[0].sid)
  game.players.insert(order, Player(sid, setup))

  return {'success': True, 'game': game_id, 'sid': sid, 'players': 2, 'turn': bool(1-order)}


@socket.event
async def play(sid, data):
  assert 'game' in data and 'move' in data
  game_id = data['game']
  move = data['move']
  game = games[game_id]
  player = game.players[0]
  opponent = game.players[1]
  assert len(opponent.ships) != 20  # Game must not be over

  # if player.sid != sid:
  #   print(player.sid, '!=', sid)
  #   game.players[0], game.players[1], player, opponent = game.players[1], game.players[0], opponent, player
  #   # return
  assert player.sid == sid  # idk about remove maybe

  print(move)
  x, y = map(int, move)
  # print(opponent.board)
  if opponent.board[y][x] != 0: return {'success': False}
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

  # Switch players, then notify new player
  game.players[0], game.players[1], player, opponent = game.players[1], game.players[0], opponent, player
  if len(player.ships) != 20:
    await socket.emit('opponent play', {'move': game.move, 'ships': player.ships}, to=player.sid)
  else:  # new player has lost
    await socket.emit('opponent play', {'move': game.move, 'ships': player.ships, 'hiddenShips': ''.join([str(i)+opponent.setup[i*3:(i+1)*3] for i in set(range(5)).difference(set(map(int, opponent.ships[::4])))])}, to=player.sid)

  return {'success': True, 'move': game.move, 'ships': player.ships}  # player.ships because since the middle of this function, opponent and player have been switched


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=80, access_log=False)

# https://www.uvicorn.org/
# https://github.com/tiangolo/fastapi
# Don't forget to add to UptimeRobot! (after changing domain oc)
