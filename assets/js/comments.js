var video_data = JSON.parse(document.getElementById('video_data').textContent);

var spinnerHTML = '<h3 style="text-align:center"><div class="loading"><i class="icon ion-ios-refresh"></i></div></h3>';
var spinnerHTMLwithHR = spinnerHTML + '<hr>';

String.prototype.supplant = function (o) {
    return this.replace(/{([^{}]*)}/g, function (a, b) {
        var r = o[b];
        return typeof r === 'string' || typeof r === 'number' ? r : a;
    });
};

function toggle_comments(event) {
    var target = event.target;
    var body = target.parentNode.parentNode.parentNode.children[1];
    if (body.style.display === 'none') {
        target.textContent = '[ − ]';
        body.style.display = '';
    } else {
        target.textContent = '[ + ]';
        body.style.display = 'none';
    }
}

function hide_youtube_replies(event) {
    var target = event.target;

    var sub_text = target.getAttribute('data-inner-text');
    var inner_text = target.getAttribute('data-sub-text');

    var body = target.parentNode.parentNode.children[1];
    body.style.display = 'none';

    target.textContent = sub_text;
    target.onclick = show_youtube_replies;
    target.setAttribute('data-inner-text', inner_text);
    target.setAttribute('data-sub-text', sub_text);
}

function show_youtube_replies(event) {
    var target = event.target;

    var sub_text = target.getAttribute('data-inner-text');
    var inner_text = target.getAttribute('data-sub-text');

    var body = target.parentNode.parentNode.children[1];
    body.style.display = '';

    target.textContent = sub_text;
    target.onclick = hide_youtube_replies;
    target.setAttribute('data-inner-text', inner_text);
    target.setAttribute('data-sub-text', sub_text);
}

function comments_failure(container, fallback, retry) {
    if (Array.isArray(fallback)) container.replaceChildren(...fallback);
    else container.innerHTML = fallback;
    container.querySelectorAll('.comments-error').forEach(function (element) { element.remove(); });
    var message = document.createElement('p');
    message.className = 'comments-error';
    InvidiousUI.status(message, InvidiousUI.label('error'), retry);
    container.prepend(message);
}

function get_youtube_comments() {
    var comments = document.getElementById('comments');

    var fallback = Array.from(comments.childNodes);
    comments.innerHTML = spinnerHTML;

    var baseUrl = video_data.base_url || '/api/v1/comments/'+ video_data.id
    var url = baseUrl +
        '?format=html' +
        '&hl=' + video_data.preferences.locale +
        '&thin_mode=' + video_data.preferences.thin_mode;

    if (video_data.ucid) {
        url += '&ucid=' + video_data.ucid
    }

    var onNon200 = function (xhr) {
        if (!video_data.comments_enabled) {
            comments.innerHTML = `
            <div id="comments-turned-off-on-video-message" class="h-box v-box">
                <p><b>${video_data.comments_youtube_disabled_text}</b></p>

                <p><b><button href="javascript:void(0)" data-comments="reddit" id="try-reddit-comments-link" class="simulated_a">
                    ${video_data.comments_youtube_disabled_try_reddit}
                </button></b></p>
            </div>`;

            document.getElementById("try-reddit-comments-link").onclick = swap_comments;
        } else {
            comments_failure(comments, fallback, get_youtube_comments);
        }

    };


    helpers.xhr('GET', url, {}, {
        on200: function (response) {
            var commentInnerHtml = ' \
            <div> \
                <h3> \
                    <a href="javascript:void(0)">[ − ]</a> \
                    {commentsText}  \
                </h3> \
                <b> \
                '
                if (video_data.support_reddit) {
                    commentInnerHtml += ' <a href="javascript:void(0)" data-comments="reddit"> \
                        {redditComments} \
                    </a> \
                    '
                }
                commentInnerHtml += ' </b> \
            </div> \
            <div>{contentHtml}</div> \
            <hr>'
            commentInnerHtml = commentInnerHtml.supplant({
                contentHtml: response.contentHtml,
                redditComments: video_data.reddit_comments_text,
                commentsText: video_data.comments_text.supplant({
                    // toLocaleString correctly splits number with local thousands separator. e.g.:
                    // '1,234,567.89' for user with English locale
                    // '1 234 567,89' for user with Russian locale
                    // '1.234.567,89' for user with Portuguese locale
                    commentCount: response.commentCount.toLocaleString()
                })
            });
            comments.innerHTML = commentInnerHtml;
            comments.children[0].children[0].children[0].onclick = toggle_comments;
            if (video_data.support_reddit) {
                comments.children[0].children[1].children[0].onclick = swap_comments;
            }
        },
        onNon200: onNon200, // declared above
        onError: onNon200,
        onTimeout: onNon200
    });
}

function get_youtube_replies(target, load_more, load_replies) {
    var continuation = target.getAttribute('data-continuation');
    if (target.dataset.loading) return;
    target.dataset.loading = 'true';

    var body = target.parentNode.parentNode;
    var fallback = Array.from(body.childNodes);
    body.innerHTML = spinnerHTML;
    var baseUrl = video_data.base_url || '/api/v1/comments/'+ video_data.id
    var url = baseUrl +
        '?format=html' +
        '&hl=' + video_data.preferences.locale +
        '&thin_mode=' + video_data.preferences.thin_mode +
        '&continuation=' + continuation;

    if (video_data.ucid) {
        url += '&ucid=' + video_data.ucid
    }
    if (load_replies) url += '&action=action_get_comment_replies';
    function failed() {
        delete target.dataset.loading;
        comments_failure(body, fallback, function () {
            var restored = body.querySelector('[data-continuation]');
            if (restored) get_youtube_replies(restored, load_more, load_replies);
        });
    }

    helpers.xhr('GET', url, {}, {
        on200: function (response) {
            if (load_more) {
                body = body.parentNode.parentNode;
                body.removeChild(body.lastElementChild);
                body.insertAdjacentHTML('beforeend', response.contentHtml);
            } else {
                body.removeChild(body.lastElementChild);

                var p = document.createElement('p');
                var a = document.createElement('a');
                p.appendChild(a);

                a.href = 'javascript:void(0)';
                a.onclick = hide_youtube_replies;
                a.setAttribute('data-sub-text', video_data.hide_replies_text);
                a.setAttribute('data-inner-text', video_data.show_replies_text);
                a.textContent = video_data.hide_replies_text;

                var div = document.createElement('div');
                div.innerHTML = response.contentHtml;

                body.appendChild(p);
                body.appendChild(div);
            }
        },
        onNon200: failed, onTimeout: failed, onError: failed
    });
}
