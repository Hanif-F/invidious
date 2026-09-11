'use strict';

// Enhance the watch-page chrome using Video.js components and its activity timer.
(function () {
    if (!window.player || typeof player.getChild !== 'function') return;
    var labels = JSON.parse(document.getElementById('watch_ui_data').textContent);
    var layout = document.getElementById('watch-layout');
    var bar = player.getChild('controlBar');
    var Button = videojs.getComponent('Button');
    var wide = new Button(player);
    wide.addClass('vjs-wide-control');
    wide.controlText(labels.wide_player);
    wide.el().setAttribute('aria-pressed', String(layout.classList.contains('watch-wide')));
    wide.on('click', function () {
        var expanded = layout.classList.toggle('watch-wide');
        wide.el().setAttribute('aria-pressed', String(expanded));
        player.trigger('playerresize');
    });
    bar.addChild(wide, {}, bar.children().indexOf(bar.getChild('fullscreenToggle')));

    // Match the other settings menus: tapping speed opens choices instead of cycling blindly.
    var rate = bar.getChild('playbackRateMenuButton');
    if (rate) {
        rate.handleClick = videojs.getComponent('MenuButton').prototype.handleClick;
        rate.createMenu = function () {
            var Menu = videojs.getComponent('Menu');
            var Item = videojs.getComponent('PlaybackRateMenuItem');
            var menu = new Menu(player, { menuButton: this });
            this.playbackRates().slice().reverse().forEach(function (value) {
                menu.addItem(new Item(player, { rate: value + 'x' }));
            });
            return menu;
        };
        rate.update();
    }

    function sizeMenus() {
        player.el().style.setProperty('--player-menu-height', Math.max(44, player.el().clientHeight - 80) + 'px');
    }
    sizeMenus();
    player.on('playerresize', sizeMenus);
    if (window.ResizeObserver) {
        var resize = new ResizeObserver(sizeMenus);
        resize.observe(player.el());
        player.on('dispose', function () { resize.disconnect(); });
    }

    // Reveal controls when pausing; the existing Video.js idle timer hides them again.
    player.on('pause', function () {
        player.userActive(true);
        player.reportUserActivity();
    });
}());
