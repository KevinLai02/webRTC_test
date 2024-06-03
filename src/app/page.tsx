"use client";
import { useEffect, useState } from "react";
import * as io from 'socket.io-client';
import { values } from 'lodash';
import Error from "next/error";

const socket = io.connect("http://localhost:8080/");

// ice server's configuration
const configuration = {
  iceServers: [
      {
          urls: 'stun:stun.l.google.com:19302',
      }, {
          urls: 'stun:stun.xten.com',
      }],
};

const signalOption = {
  offerToReceiveAudio: 1, // 是否傳送聲音流給對方
  offerToReceiveVideo: 1, // 是否傳送影像流給對方
};

const room =  "testRoom";

export default function Home() {
  const [localStream, setLocalStream] = useState<MediaStream>()
  const [remote, setRemote] = useState<MediaStream>()
  const [pcPeers, setPcPeers] = useState<RTCPeerConnection>()
  const join = async () => {
      socket.emit('join', room);
      createPeerConnection()
  };

  const hangup = () => {
    // 移除事件監聽
    pcPeers!.onicecandidate = null;
    pcPeers!.onnegotiationneeded = null;

    // 關閉 RTCPeerConnection 連線並釋放記憶體
    pcPeers!.close();
    setPcPeers(undefined);

    // 傳遞掛斷事件給 Server
    socket.emit('hangup', room);

    // 移除遠端 video src
    setRemote(undefined); // 移除遠端媒體串流
  };

  const createPeerConnection = () => {
    // 設定 iceServer
    // 建立 RTCPeerConnection
    const peers: RTCPeerConnection = new RTCPeerConnection(configuration);
    setPcPeers(peers)
    // 增加本地串流
    localStream?.getTracks().forEach((track) => {
      peers?.addTrack(track, localStream);
    });

    // 找尋到 ICE 候選位址後，送去 Server 與另一位配對
      peers.onicecandidate = (e) => {
        if (e.candidate) {
            // 發送 ICE
            socket.emit('ice_candidate', room, {
                label: e.candidate.sdpMLineIndex,
                id: e.candidate.sdpMid,
                candidate: e.candidate.candidate,
            });
        }
    };

    // 監聽 ICE 連接狀態
    peers.oniceconnectionstatechange = (e) => {
        // 若連接已斷，執行掛斷相關動作
        const peerConnection = e.target as RTCPeerConnection;
        if (peerConnection.iceConnectionState === 'disconnected') {
            hangup();
        }
    };

    // 監聽是否有媒體串流傳入
    peers.ontrack = (event) => {
      const [stream] = event.streams;
      setRemote(stream);
  };
  };
    
  const createLocalStream = async () => {
    try {
      const constraints = { audio: true, video: true };

      // getUserMedia 取得本地影音串流
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream)
    } catch (err) {
      console.log('getUserMedia error: ', err);
    }
  };

    const sendSDP = async (type: string) => {
      try {
          if (!pcPeers) {
              console.log('尚未開啟視訊');
              return;
          }
  
          const method = type === 'offer' ? 'createOffer' : 'createAnswer';
          const offerOptions = {
              offerToReceiveAudio: true, // 是否傳送聲音流給對方
              offerToReceiveVideo: true // 是否傳送影像流給對方
          };
  
          // 建立 SDP
          const localSDP = await pcPeers?.[method](offerOptions);
  
          // 設定本地 SDP
          await pcPeers?.setLocalDescription(localSDP);
  
          // 發送 SDP
          socket.emit(type, room, pcPeers?.localDescription);
      } catch (err) {
          console.log('error: ', err);
      }
  };

    useEffect(() => {
      createLocalStream()
        // 監聽加入房間
      socket.on('ready', (msg) => {
        // 發送 Offer SDP
        sendSDP('offer');
      });

      // 監聽收到 Offer
      socket.on('offer', async (desc) => {
          // 設定對方的媒體串流
          await pcPeers?.setRemoteDescription(desc);
          // 發送 Answer SDP
          await sendSDP('answer');
      });

      // 監聽收到 Answer
      socket.on('answer', (desc) => {
          // 設定對方的媒體串流
          pcPeers?.setRemoteDescription(desc)
      });

      // 監聽收到 ICE 候選位址
      socket.on('ice_candidate', (data) => {
          // RTCIceCandidate 用以定義 ICE 候選位址
          const candidate = new RTCIceCandidate({
              sdpMLineIndex: data.label,
              candidate: data.candidate
          });
          // 加入 ICE 候選位址
          pcPeers?.addIceCandidate(candidate);
      });
    }, [pcPeers])
    console.log(remote);
    
  return (
    <div>
      <div>
        <button onClick={() => {
            join()
        }}>Join
        </button>
      </div>
      <video 
        ref={video => {
          if (video && localStream) {
            video.srcObject = localStream;
          }
        }}
        controls
        autoPlay
        muted
      />
      {remote && (
        <video
          ref={video => {
            if (video) {
              video.srcObject = remote;
            }
          }}
          autoPlay
          playsInline
          muted={true}
        />
        )
      }
    </div>
  );
}
