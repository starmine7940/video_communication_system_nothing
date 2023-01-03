const Peer = window.Peer;

// MediaDeviceInfoをOption要素に変換する
const convertInfoToOption = (deviceInfo) => {
    const option = document.createElement('option');
    option.value = deviceInfo.deviceId;
    option.label = deviceInfo.label;
    return option;
}

// DeviceInfoを取得する
function getDeviceList(deviceInfos){
    const audioDeviceInfos = deviceInfos.filter((deviceInfo) => deviceInfo.kind === 'audioinput');
    const videoDeviceInfos = deviceInfos.filter((deviceInfo) => deviceInfo.kind === 'videoinput');
    return { audioDeviceInfos, videoDeviceInfos };
}

(async function main(){
    const myVideo = document.getElementById('my-video');
    const myId = document.getElementById('my-id');
    const videosContainer = document.getElementById('videos-container');
    const myVideoContainer = document.getElementById('my-video-container');
    const displayedMyName = document.getElementById('displayed-my-name');
    const myEmotion = document.getElementById('my-emotion');
    const myEmotionBar = document.getElementById('my-emotion-bar');
    const myName = document.getElementById('my-name');
    const roomId = document.getElementById('room-id');
    const messages = document.getElementById('messages');
    const joinButton = document.getElementById('join-button');
    const leaveButton = document.getElementById('leave-button');
    const audioSelect = document.getElementById('audioSource');
    const videoSelect = document.getElementById('videoSource');
    const audioEnabledButton = document.getElementById('audio-enabled-button');
    const videoEnabledButton = document.getElementById('video-enabled-button');
    let audioEnabledValue = true;
    let videoEnabledValue = true;
    let localStream;
    let memberList = {};
    let room;

    // デバイスのプルダウンメニューを生成する
    navigator.mediaDevices.enumerateDevices().then((deviceInfos) => {
        // Option要素に変換する
        const audioOptions = getDeviceList(deviceInfos)['audioDeviceInfos'].map(convertInfoToOption);
        const videoOptions = getDeviceList(deviceInfos)['videoDeviceInfos'].map(convertInfoToOption);
        // Select要素に追加する
        audioSelect.append(...audioOptions);
        videoSelect.append(...videoOptions);
        videoSelect.addEventListener('change', changeDevice);
        audioSelect.addEventListener('change', changeDevice);
    }).catch((error) => {
        // console.error(error);
    });
    
    // デバイスを変更する関数
    async function changeDevice(){
        let audioSource = audioSelect.value;
        let videoSource = videoSelect.value;
        let constraints = {
            audio: {deviceId: {exact: audioSource}},
            video: {deviceId: {exact: videoSource}}
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        myVideo.srcObject = newStream;
        if(room !== undefined){
            room.replaceStream(newStream);
        }
        localStream = newStream;
        keepTrackEnabled();
    }

    // ボタンにデバイスを変更する関数を紐付る
    audioEnabledButton.addEventListener('click', () => {
        updateAudioEnabled();
    })
    videoEnabledButton.addEventListener('click', () => {
        updateVideoEnabled();
    })

    // localStreamを作成する
    localStream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabledValue,
        audio: audioEnabledValue
    });
    myVideo.srcObject = localStream;
    
    // Peerを作成する
    const peer = new Peer({
        key: SKYWAY_KEY,
        debug: 0
    });
    peer.on('open', (id) => {
        myId.textContent = id;
        myVideoContainer.setAttribute('id', id);
    });

    // Joinボタンが押されたら通信を開始する
    joinButton.addEventListener('click', () => {
        room = peer.joinRoom(roomId.value, {
            mode: 'mesh',
            stream: localStream
        });

        // 入室する時
        room.on('open', () => {
            messages.textContent += '===You joined===\n';
            displayedMyName.textContent = myName.value;
            myEmotionBar.value = 2;
            myEmotion.textContent = change_emotion(myEmotionBar.value);
            room.send({'event': 'name', 'data': myName.value});
            room.send({'event': 'emotion', 'data': myEmotionBar.value});
        });

        // 相手が入室してきた時
        room.on('peerJoin', peerId => {
            messages.textContent += '===' + String(peerId) + ' joined===\n';
            room.send({'event': 'name', 'data': myName.value});
            room.send({'event': 'emotion', 'data': myEmotionBar.value});
        });

        // MediaStreamを受信した時
        room.on('stream', stream => {
            createPersonalVideoContainer(stream);
        });

        // データを受け取った時
        room.on('data', ({ data, src }) => {
            const personalVideoContainer = document.getElementById(src);
            if(data.event == 'name'){
                if(personalVideoContainer != null){
                    const personalName = personalVideoContainer.querySelector('.name');
                    personalName.textContent = data.data;
                }
                memberList[src] = data.data;
            }
        });

        // 相手が退出した時
        room.on('peerLeave', peerId => {
            const personalVideoContainer = videosContainer.querySelector('#' + String(peerId));
            personalVideoContainer.parentNode.removeChild(personalVideoContainer);
            delete memberList.peerId;
            messages.textContent += '===' + String(peerId) + ' left===\n';
        });

        // 自分が退出した時
        room.once('close', () => {
            const personalVideoContainers = videosContainer.children;
            Array.from(personalVideoContainers).forEach(personalVideoContainer => {
                if(personalVideoContainer.id != myId.textContent){
                    personalVideoContainer.parentNode.removeChild(personalVideoContainer);
                }
            });
            messages.textContent += '===You left===\n';
        });

        // Leaveボタンが押されたら通信を終了する
        leaveButton.addEventListener('click', () => {
            room.close();
        }, { once: true });
    });

    peer.on('error', console.error);

    // 相手の要素を作る
    function createPersonalVideoContainer(stream){
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = stream;
        remoteVideo.playsInline = true;
        remoteVideo.setAttribute('data-peer-id', stream.peerId);
        // 枠オブジェクト
        const remoteVideoContainer = document.createElement('div');
        remoteVideoContainer.setAttribute('id', stream.peerId);
        remoteVideoContainer.classList.add('personal-video-container');
        remoteVideoContainer.classList.add('small-container');
        // 名前オブジェクト
        const remoteName = document.createElement('h1');
        if(stream.peerId in memberList){
            remoteName.textContent = memberList[stream.peerId];
        }else{
            remoteName.textContent = '（名前を入力してください）';   //仮の名前
        }
        remoteName.classList.add('name');
        // セットする
        remoteVideoContainer.append(remoteVideo);
        remoteVideoContainer.append(remoteName);
        videosContainer.append(remoteVideoContainer);
        remoteVideo.play().catch(console.error);
    }

    // 気持ちの表示を変える
    function change_emotion(emotion){
        let emotion_text = '';
        switch(emotion){
            case 0:
                emotion_text = '離れたい';
                break
            case 1:
                emotion_text = 'どちらかといえば離れたい';
                break
            case 2:
                emotion_text = 'どちらともいえない';
                break
            case 3:
                emotion_text = 'どちらかといえば近づきたい';
                break
            case 4:
                emotion_text = '近づきたい';
                break
        }
        return emotion_text;
    }

    // 左右キーが押されたら気持ちを変える
    document.addEventListener('keydown', function(e){
        let changed_flag = false;
        if(e.code == 'ArrowLeft' && myEmotionBar.value > 0){
            myEmotionBar.value -= 1;
            changed_flag = true;
        }else if(e.code == 'ArrowRight' && myEmotionBar.value < 4){
            myEmotionBar.value += 1;
            changed_flag = true;
        }
        if(changed_flag){
            myEmotion.textContent = change_emotion(myEmotionBar.value);
            try{
                room.send({'event': 'emotion', 'data': myEmotionBar.value});    //Joinボタンを押さないと送れない
                post_to_sheet(roomId.value, myName.value, myEmotionBar.value);
            }catch(error){
                // console.log(error);
            }
            changed_flag = false;
        }
    })

    // スプレッドシートに書き込む
    function post_to_sheet(roomId, name, emotion){
        // console.log('post');
        const postData = {
            'roomId': roomId,
            'name': name,
            'time': Date.now(),
            'emotion': emotion
        }
        const param = {
            'method': 'POST',
            'mode': 'no-cors',
            'Content-Type' : 'application/x-www-form-urlencoded',
            'body': JSON.stringify(postData)
        }
        fetch(SCRIPT_URL, param)
            .then((response) => {
                // console.log(response);
            })
            .catch((error) => {
                // console.log(error);
            });
    }

    // デバイスのオンオフを保持する
    function keepTrackEnabled(){
        localStream.getAudioTracks().forEach(track => {
            track.enabled = audioEnabledValue;
        })
        localStream.getVideoTracks().forEach(track => {
            track.enabled = videoEnabledValue;
        })
    }

    // オーディオのオンオフを切り替える
    function updateAudioEnabled(){
        localStream.getAudioTracks().forEach(track => {
            if(track.enabled == true){
                track.enabled = false;
                audioEnabledValue = false;
                audioEnabledButton.textContent = 'ON';
            }else{
                track.enabled = true;
                audioEnabledValue = true;
                audioEnabledButton.textContent = 'OFF';
            }
        })
    }
    
    // ビデオのオンオフを切り替える
    function updateVideoEnabled(){
        localStream.getVideoTracks().forEach(track => {
            if(track.enabled == true){
                track.enabled = false;
                videoEnabledValue = false;
                videoEnabledButton.textContent = 'ON';
            }else{
                track.enabled = true;
                videoEnabledValue = true;
                videoEnabledButton.textContent = 'OFF';
            }
        })
    }
})();