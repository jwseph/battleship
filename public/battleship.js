/// <reference path="./jquery.min.js" />
/// <reference path="./socket.io.min.js" />
$(function () { $('#heading, #setup').css('visibility', 'visible'); });

var titleToggleable = true;
$('#title')
  .on('click', function () {
    if (!titleToggleable) return;
    titleToggleable = false;

    localStorage.dark = localStorage.dark?'':' ';
    if (!localStorage.dark) $('head')
      .find('#dark')
        .prop('disabled', true)
      .end()
      .find('#light')
        .prop('disabled', false)
    ;
    else $('head')
      .find('#light')
        .prop('disabled', true)
      .end()
      .find('#dark')
        .prop('disabled', false)
    ;

    setTimeout(function () { titleToggleable = true; }, 150);
  })
;

const socket = io('wss://battleship-heroku.herokuapp.com', {path: '/battleship/socket.io'});

const board = new Array(10).fill(0).map(() => new Array(10).fill(0));
const lengths = [2, 3, 3, 4, 5];
const names = ['ptboat', 'cruiser', 'submarine', 'battleship', 'carrier'];
const leftOffset = 128;
const topOffset = 2;
const blockW = 32;
var placedShips = 0;
var dragLeft, dragTop;
var setup, game, sid;
var shipsDestroyed = 0, enemyShipsDestroyed = 0;
var lastMove;
var gameStatus = true;  // true during setup or before game ends
var blockAimer = false;
var pageX, pageY;


socket.on('connect', () => {
  console.log('connected');
});

socket.on('disconnect', () => {
  console.log('disconnected');
  if (gameStatus && $('#play').css('display') != 'none') {
    gameStatus = false;
    blockAimer = true;
    $('#banner').text("You have disconnected.").addClass('lose');
    $('#rematch-button').css('display', 'block');
  }
});

socket.on('opponent disconnect', () => {
  console.log('opponent disconnected');
  if (gameStatus && $('#play').css('display') != 'none') {
    gameStatus = false;
    blockAimer = true;
    $('#banner').text("Opponent has disconnected.").addClass('win');
    $('#rematch-button').css('display', 'block');
  }
})


function resetPlay() {
  shipsDestroyed = enemyShipsDestroyed = 0;
  gameStatus = true;
  blockAimer = false;
  $('#play')
    .find('.battlefield-table')
      .removeClass('transparent')
      .css('opacity', '1.0')
      .find('.battlefield-cell')
        .removeClass(['hit', 'miss', 'hit-ship', 'h', 'v', 'move'])
      .end()
      .find('.battlefield-cell[data-y="0"][data-x="0"]')
        .find('.ship')
          .remove()
        .end()
        .find('#aimer')
          .css({display: 'none', left: '0em', top: '0em'})
        .end()
      .end()
    .end()
    .find('#rematch-button')
      .css('display', 'none')
    .end()
  ;
}


$('.port')
  .find('.ptboat')
    .data({length: 2, align: 'v'})
  .end()
  .find('.cruiser,.submarine')
    .data({length: 3, align: 'v'})
  .end()
  .find('.battleship')
    .data({length: 4, align: 'v'})
  .end()
  .find('.carrier')
    .data({length: 5, align: 'v'})
;

$('.ship.interactive').draggable({
  start: function() {
    [dragLeft, dragTop] = [document.documentElement.scrollLeft || document.body.scrollLeft, document.documentElement.scrollTop || document.body.scrollTop];
    var left = Math.round((parseInt(this.style.left)-leftOffset)/32);
    var top = Math.round((parseInt(this.style.top)-topOffset)/32);
    var length = $(this).data('length');

    // Erase from board
    if ($(this).data('align') === 'v') {
      if (0 <= left && left < 10 && 0 <= top && top+length-1 < 10) {
        for (let n = 0; n < length; ++n) board[top+n][left] = 0;
        --placedShips;
        $('#play-button').addClass('blocked');
      }
    } else {
      if (0 <= left && left+length-1 < 10 && 0 <= top && top < 10) {
        for (let n = 0; n < length; ++n) board[top][left+n] = 0;
        --placedShips;
        $('#play-button').addClass('blocked');
      }
    }

  },
  drag: function() {
    window.scrollTo(dragLeft, dragTop);
    var left = Math.round((parseInt(this.style.left)-leftOffset)/32);
    var top = Math.round((parseInt(this.style.top)-topOffset)/32);
    var length = $(this).data('length');
    var valid = isValidShip.call(this, left, top);
    if (valid) {
      $(this)
        .css('visibility', 'hidden')
        .addClass('ship-purple')
      .parent().find('.ship-shadow')
        .css({
          visibility: 'visible',
          left: left*32+leftOffset+'px',
          top: top*32+topOffset+'px'
        })
        .removeClass('ship-black')
      ;
    } else {
      $(this)
        .css('visibility', 'visible')
        .removeClass('ship-purple')
      .parent().find('.ship-shadow')
        .css('visibility', 'hidden')
        .addClass('ship-black')
      ;
    }
  },
  stop: function() {
    var left = Math.round((parseInt(this.style.left)-leftOffset)/32);
    var top = Math.round((parseInt(this.style.top)-topOffset)/32);
    var length = $(this).data('length');
    var valid = isValidShip.call(this, left, top);

    $(this).css('visibility', 'visible').removeClass('ship-purple');
    $('.ship-shadow').css('visibility', 'hidden').addClass('ship-black');
    if (valid) {
      $(this).data({lastLeft: left, lastTop: top});
      if ($(this).data('align') === 'v') for (let n = 0; n < length; ++n) board[top+n][left] = 1;
      else for (let n = 0; n < length; ++n) board[top][left+n] = 1;
      $(this).css({
        left: left*32+leftOffset+'px',
        top: top*32+topOffset+'px'
      });
      if (++placedShips === 5) $('#play-button').removeClass('blocked');

    } else if ($(this).data('lastLeft') !== undefined && valid !== 0 && isValidShip.call(this, $(this).data('lastLeft'), $(this).data('lastTop'))) {
      left = $(this).data('lastLeft');
      top = $(this).data('lastTop');
      if ($(this).data('align') === 'v') for (let n = 0; n < length; ++n) {board[top+n][left] = 1;}
      else for (let n = 0; n < length; ++n) board[top][left+n] = 1;
      $(this).css({
        left: left*32+leftOffset+'px',
        top: top*32+topOffset+'px'
      });
      if (++placedShips === 5) $('#play-button').removeClass('blocked');

    } else {
      // Erase from board
      left = $(this).data('lastLeft');
      top = $(this).data('lastTop');
      if ($(this).data('align') === 'v') {
        if (0 <= left && left < 10 && 0 <= top && top+length-1 < 10) for (let n = 0; n < length; ++n) board[top+n][left] = 0;
      } else {
        if (0 <= left && left+length-1 < 10 && 0 <= top && top < 10) for (let n = 0; n < length; ++n) board[top][left+n] = 0;
      }

      $(this)
        .css({left: '', top: ''})
        .removeData(['lastLeft', 'lastTop'])
        .removeClass('h')
        .addClass('v')
        .data('align', 'v')
      .parent().find('.ship-shadow')
        .removeClass('h')
        .addClass('v')
      ;
    }
  }
})
.click(function (e) {
  var left = Math.round((parseInt(this.style.left)-leftOffset)/32);
  var top = Math.round((parseInt(this.style.top)-topOffset)/32);
  var length = $(this).data('length');
  var prevAlign, nextAlign;
  if ($(this).data('align') === 'v') [prevAlign, nextAlign] = ['v', 'h'];
  else [prevAlign, nextAlign] = ['h', 'v'];
  var valid = isValidShip.call(this, left, top, nextAlign);

  if (valid) {
    // Move on board
    if (prevAlign == 'v') for (let n = 0; n < length; ++n) {
      board[top+n][left] = 0;  // Remove previous position
            board[top][left+n] = 1;  // Add new position
          } else for (let n = 0; n < length; ++n) {
      board[top][left+n] = 0;
      board[top+n][left] = 1;
    }

    // Rotate visually
    $(this)
      .removeClass(prevAlign)
      .addClass(nextAlign)
      .data('align', nextAlign)
    .parent().find('.ship-shadow')
      .removeClass(prevAlign)
      .addClass(nextAlign)
    ;
  } else if (this.style.left !== '' && this.style.top !== '' && !$(this).is('.shaking')){
    $(this)
      .addClass('shaking')
      .effect('shake', {distance: 3, times: 2}, 200, function () {
        $(this).removeClass('shaking');
      })
    ;
  }
});

function isValidShip(left, top, align=null) {
  // var left = Math.round((parseInt(this.style.left)-leftOffset)/32);
  // var top = Math.round((parseInt(this.style.top)-topOffset)/32);
  var length = $(this).data('length');
  var valid = true;

  var isOnRotate = align !== null?1:0;  // align parameter should only be defined when called from click-to-rotate
  if (!isOnRotate) {
    align = $(this).data('align');
  }

  if (align === 'v') {
    if (!(0 <= left && left < 10 && 0 <= top && top+length-1 < 10)) valid = 0;
    else for (let n = isOnRotate; n < length; ++n) if (board[top+n][left] != 0) {
      valid = false;
      break;
    }
  } else {
    if (!(0 <= left && left+length-1 < 10 && 0 <= top && top < 10)) valid = 0;
    else for (let n = isOnRotate; n < length; ++n) if (board[top][left+n] != 0) {
      valid = false;
      break;
    }
  }
  return valid;
}


// #endregion SETUP


// function consolelog(str) {
//   $('#title').text($('#title').text()+'\\'+str+'\\');
// }

$('#play-button')
  .on('click', function() {
    if ($(this).is('.blocked, .forced')) return;
    $(this)
      .addClass('forced')
      .text('Joining...')
    ;
    $('#setup .battlefield-table').css('opacity', '0.4').addClass('transparent');

    setup = '';
    for (const ship of names) {
      var data = $(`.ship.interactive.${ship}`)
        .draggable('disable')
        .data()
      ;
      setup = setup+data['lastLeft']+data['lastTop']+(data['align'] === 'v'?1:0);
    }
    join();
  })
;

function join() {
  socket.emit('join', {setup: setup}, (data) => {
    if (!data['success']) window.location.reload();
    game = data['game'];
    sid = data['sid'];
    switch (data['players']) {
      case 1: {  // First player
        $("#play-button").text('Finding opponent...');
        break;
      }
      case 2: {  // Second player
        console.log('I am the second player.');
        showPlayLayout();
        if (data['turn']) play();
        else view();
        break;
      }
    }
  });
}

socket.on('opponent join', (data) => {
  console.log('Second player has joined.');
  showPlayLayout();
  if (data['turn']) play();
  else view();
});

function showAimer() {
  var x = pageX - $('.opponent.battlefield-table > .battlefield-body').offset().left;
  var y = pageY - $('.opponent.battlefield-table > .battlefield-body').offset().top;
  var left = Math.floor(x/32);
  var top = Math.floor(y/32);
  if (0 <= left && left < 10 && 0 <= top && top < 10 && !$('.battlefield-table.opponent').is('.transparent')) {
    var borderRadius = '0';
    if      (top === 0 && left === 0) borderRadius = '0.5em 0 0 0';
    else if (top === 0 && left === 9) borderRadius = '0 0.5em 0 0';
    else if (top === 9 && left === 9) borderRadius = '0 0 0.5em 0';
    else if (top === 9 && left === 0) borderRadius = '0 0 0 0.5em';
    $('#aimer').css({
      left: left+'em',
      top: top+'em',
      display: 'block',
      borderRadius: borderRadius
    });
  } else {
    $('#aimer').css('display', 'none');
  }
}

$('#play')
  .on('mousemove', function (e) {
    [pageX, pageY] = [e.pageX, e.pageY];
    if (!blockAimer) showAimer();
  })
  .on('mouseleave', function(e) {
    $('#aimer').css('display', 'none');
  })
;

function showPlayLayout() {
  $('body')
    .find('#setup')
      .css('display', 'none')
    .end()
    .find('#play')
      .css('display', 'block')
  ;

  var firstCell = $('.battlefield-table.player .battlefield-cell[data-y="0"][data-x="0"]');
  for (let i = 0; i < 5; ++i) {
    firstCell
      .append(`<div class="ship ${names[i]} ${setup[i*3+2] == 1?'v':'h'}" style="left:${setup[i*3]}em; top:${setup[i*3+1]}em"></div>`)
    ;
  }
}


function play() {
  if (!gameStatus) return;
  $('#banner').text('Your turn. Choose a spot to fire at, then click to launch a missile.');
  $('.battlefield-table.player').addClass('transparent').css('opacity', '0.4');
  $('.battlefield-table.opponent').removeClass('transparent').css('opacity', '1.0');
  $('#aimer')
    .on('click', function () {
      $('#aimer').css('display', 'none').off('click');
      blockAimer = true;

      socket.emit(
        'play', {
          game: game,
          sid: sid,
          move: (this.style.left+this.style.top).replaceAll('em', '')
        },
        function (data) {
          if (data['success']) {
            blockAimer = false;
            var x = parseInt(data['move'][0][0]);
            var y = parseInt(data['move'][0][1]);
            $('.battlefield-table.opponent .battlefield-cell.move').removeClass('move');
            switch (data['move'][1]) {
              case 1: {  // Miss
                $(`.battlefield-table.opponent .battlefield-cell[data-y="${y}"][data-x="${x}"]`)
                  .addClass(['miss', 'move'])
                ;
                break;
              }
              case 2: {  // Hit
                if (data['ships'].length/4 == enemyShipsDestroyed) {  // No new ships were fully destroyed
                  $(`.battlefield-table.opponent .battlefield-cell[data-y="${y}"][data-x="${x}"]`)
                    .addClass(['hit', 'move'])
                  ;
                } else {
                  var ship = data['ships'].substring(4*enemyShipsDestroyed);
                  enemyShipsDestroyed += 1;
                  var shipX = parseInt(ship[1]);
                  var shipY = parseInt(ship[2]);
                  var table = $('.battlefield-table.opponent');
                  if (ship[3] == 1) for (let n = 0; n < lengths[ship[0]]-1; ++n) {
                    table
                      .find(`.battlefield-cell[data-y="${shipY+n}"][data-x="${shipX}"]`)
                      .removeClass('hit')
                      .addClass(['hit-ship', 'v'])
                    ;
                    table.find(`.battlefield-cell[data-y="${shipY+lengths[ship[0]]-1}"][data-x="${shipX}"]`).removeClass('hit').addClass('hit-ship');
                  } else for (let n = 0; n < lengths[ship[0]]-1; ++n) {
                    table
                      .find(`.battlefield-cell[data-y="${shipY}"][data-x="${shipX+n}"]`)
                      .removeClass('hit')
                      .addClass(['hit-ship', 'h'])
                    ;
                    table.find(`.battlefield-cell[data-y="${shipY}"][data-x="${shipX+lengths[ship[0]]-1}"]`).removeClass('hit').addClass('hit-ship');
                  }
                  table
                    .find(`.battlefield-cell[data-y="${y}"][data-x="${x}"]`)
                      .addClass('move')
                    .end()
                    .find('.battlefield-cell[data-y="0"][data-x="0"]')
                      .append(`<div class="ship ${names[ship[0]]} ${ship[3] == 1?'v':'h'} hit" style="left:${shipX}em; top:${shipY}em"></div>`)
                  ;
                  if (enemyShipsDestroyed === 5) {
                    gameStatus = false;
                    blockAimer = true;
                    $('#banner').text("You have won the game!").addClass('win');
                    $('#rematch-button').css('display', 'block');
                  }
                }
                break;
              }
            }
            view();
          } else {
            blockAimer = false;
            $('#aimer').css('display', 'block')
            play();
          }
        }
      );

    })
  ;
  showAimer();
}

socket.on('opponent play', (data) => {
  console.log('Opponent has played');
  var x = parseInt(data['move'][0][0]);
  var y = parseInt(data['move'][0][1]);
  $('.battlefield-table.player .battlefield-cell.move').removeClass('move');
  switch (data['move'][1]) {
    case 1: {  // Miss
      $(`.battlefield-table.player .battlefield-cell[data-y="${y}"][data-x="${x}"]`)
        .addClass(['miss', 'move'])
      ;
      break;
    }
    case 2: {  // Hit
      if (data['ships'].length/4 == shipsDestroyed) {  // No new ships were fully destroyed
        $(`.battlefield-table.player .battlefield-cell[data-y="${y}"][data-x="${x}"]`)
          .addClass(['hit', 'move'])
        ;
      } else {
        var ship = data['ships'].substring(4*shipsDestroyed);
        shipsDestroyed += 1;
        var shipX = parseInt(ship[1]);
        var shipY = parseInt(ship[2]);
        var table = $('.battlefield-table.player');
        if (ship[3] == 1) for (let n = 0; n < lengths[ship[0]]-1; ++n) {
          table
            .find(`.battlefield-cell[data-y="${shipY+n}"][data-x="${shipX}"]`)
            .removeClass('hit')
            .addClass(['hit-ship', 'v'])
          ;
          table.find(`.battlefield-cell[data-y="${shipY+lengths[ship[0]]-1}"][data-x="${shipX}"]`).removeClass('hit').addClass('hit-ship');
        } else for (let n = 0; n < lengths[ship[0]]-1; ++n) {
          table
            .find(`.battlefield-cell[data-y="${shipY}"][data-x="${shipX+n}"]`)
            .removeClass('hit')
            .addClass(['hit-ship', 'h'])
          ;
          table.find(`.battlefield-cell[data-y="${shipY}"][data-x="${shipX+lengths[ship[0]]-1}"]`).removeClass('hit').addClass('hit-ship');
        }
        table
          .find(`.battlefield-cell[data-y="${y}"][data-x="${x}"]`)
            .addClass('move')
          .end()
          .find(`.battlefield-cell[data-y="0"][data-x="0"] > .ship.${names[ship[0]]}.${ship[3] == 1?'v':'h'}`)
            .addClass('hit')
        ;
        if (shipsDestroyed === 5) {
          gameStatus = false;
          $('#banner').text("You have lost the game. GET GOOD L").addClass('lose');
          $('#rematch-button').css('display', 'block');

          // Display undiscovered ships
          var firstCell = $('.battlefield-table.opponent .battlefield-cell[data-y="0"][data-x="0"]');
          var hiddenShips = data['hiddenShips'];
          for (let i = 0; i < hiddenShips.length/4; ++i) {
            firstCell
              .append(`<div class="ship ${names[hiddenShips[i*4]]} ${hiddenShips[i*4+3] == 1?'v':'h'}" style="left:${hiddenShips[i*4+1]}em; top:${hiddenShips[i*4+2]}em"></div>`)
            ;
          }

        }
      }
      break;
    }
  }
  play();
});

function view() {
  if (!gameStatus) return;
  $('#banner').text("Opponent's turn. Please wait for them to make their move.");
  $('.battlefield-table.opponent').addClass('transparent').css('opacity', '0.4');
  $('.battlefield-table.player').removeClass('transparent').css('opacity', '1');
}

$('#rematch-button')
  .on('click', function () {
    $('body')
      .find('#play')
        .css('display', 'none')
      .end()
      .find('#setup')
        .css('display', 'block')
      .end()
      .find('#banner')
        .removeClass(['win', 'lose'])
        .text('Place your ships, then click to rotate.')
      .end()
    ;
    resetSetup();
    resetPlay();
  }
);

function resetSetup() {
  $('#setup')
    .find('.battlefield-table')
      .removeClass('transparent')
      .css('opacity', '1.0')
    .end()
    .find('.ship.interactive')
      .css({left: '', top: ''})
      .draggable('enable')
      .removeClass('h')
      .addClass('v')
      .data('align', 'v')
    .end()
    .find('.ship-shadow')
      .css({left: '', top: ''})
      .removeClass('h')
      .addClass('v')
      .data('align', 'v')
    .end()
    .find('#play-button')
      .removeClass('forced')
      .addClass('blocked')
      .text('Play')
    .end()
  ;
  for (let i = 0; i < 10; ++i) for (let j = 0; j < 10; ++j) board[i][j] = 0;
  placedShips = 0;
}