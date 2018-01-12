// Require the packages we will use:
var http = require("http"),
    socketio = require("socket.io"),
    fs = require("fs"),
    usernames = {},
    ChatRooms = ['lobby'],
    ChatRooms_Pass = {'lobby':''},
    ChatRooms_Users = {'lobby':new Set()},
    ChatRoomOwners = {},
    ChatRoomBanners = {'lobby':new Set()};

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
// This callback runs when a new connection is made to our HTTP server.

fs.readFile("client.html", function(err, data){
    // This callback runs when the client.html file has been read from the filesystem.

    if(err) return resp.writeHead(500);
    resp.writeHead(200);
    resp.end(data);
});
});
app.listen(3456);


// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.
  socket.on('message_to_server', function(data) {
  		// This callback runs when the server receives a new message from the client.
  		console.log("message: "+data["message"]); // log it to the Node.JS output
      var msg = data["message"];
      //emit it only to people in the room
      console.log("socket room: ",socket.room);
      socket.broadcast.in(socket.room).emit("message_to_client", socket.username, msg);
      socket.emit("message_to_client", socket.username, msg);
      //io.sockets.in(socket.room).emit("message_to_client", socket.username, msg);
  });

  socket.on('addNewUser', function(username){
    
    socket.username = username;
    socket.room = "lobby";
    //console.log("New user", username);
    //console.log("addUser Server: ", ChatRooms);
    usernames[username] = socket.room;//log user in what chat room currently
    socket.join('lobby');//join namespace lobby
    
    ChatRooms_Users["lobby"].add(username);
    
    socket.emit("updateCurrentRooms", ChatRooms, ChatRooms_Pass);
    
    socket.emit('informRoomUsers', username, Array.from(ChatRooms_Users["lobby"]));
    socket.broadcast.to(socket.room).emit('informRoomUsers', username, Array.from(ChatRooms_Users["lobby"]));
    //console.log("New User: ", ChatRooms_Users["lobby"]);
  });

  socket.on("newRoomLog", function(room, pass, owner){
    ChatRooms.push(room);
    ChatRooms_Pass[room] = pass;
    ChatRoomOwners[room] = owner;
    ChatRooms_Users[room] = new Set();
    ChatRoomBanners[room] = new Set();
    socket.emit("updateCurrentRooms", ChatRooms, ChatRooms_Pass);
    //console.log('ChatRooms: ', ChatRooms);
    socket.broadcast.emit("updateCurrentRooms", ChatRooms, ChatRooms_Pass);
    //console.log(ChatRooms);
  });

  socket.on("switchRoomMsg",function(source, destination, user){

    socket.room = destination;
    usernames[user] = destination;
    if(ChatRoomBanners[destination].has(user)){
        socket.emit("bannedInform", "You have been banned into this room!");
    }else{
        ChatRooms_Users[source].delete(user);
        ChatRooms_Users[destination].add(user);

        socket.leave(source);
        socket.join(destination);

        socket.emit('informRoomUsers', user, Array.from(ChatRooms_Users[destination]));
        socket.broadcast.to(destination).emit('informRoomUsers', user, Array.from(ChatRooms_Users[destination]));
        socket.emit("changePresentRoom", destination);

        socket.broadcast.to(source).emit('informRoomUsersExit', user, Array.from(ChatRooms_Users[source]));
        
    }
  });

  socket.on("opposite", function(privateRequest, privateOpposite){
    var privateChatChannel = privateRequest + privateOpposite;
    //private request joins private chat channel
    socket.join(privateChatChannel);
    socket.broadcast.emit("findOpposite", privateRequest, privateOpposite);
  });

  socket.on("findOppositeResponse", function(request, opposite, oppoFlag){
    var privateChatChannel = request + opposite;
    var channelFlag;
    if(oppoFlag === true){
        //privateChatChannel = request + oppsite;
        channelFlag = oppoFlag;
        //private opposite joins chat channel 
        socket.join(privateChatChannel);
        console.log("Private Chat Channel: ", channelFlag, privateChatChannel);
        socket.broadcast.to(privateChatChannel).emit("oppositeResponse", {flag:channelFlag, channel:privateChatChannel, opposite:opposite});
        socket.emit("informOpposite", request, opposite, channelFlag);
      }else{
        channelFlag = oppoFlag;
        socket.broadcast.to(privateChatChannel).emit("oppositeResponse", {flag:channelFlag, channel:privateChatChannel, opposite:opposite});
      }
  });

  socket.on("private_msg_to_server", function(data){
      console.log("Private Chat: ", data["channel"], data["private_msg"],data["sender"]);
      socket.broadcast.to(data["channel"]).emit("private_msg_to_client", data["sender"], data["private_msg"]);
      socket.emit("private_msg_to_client", data["sender"], data["private_msg"]);

  });

  socket.on("endPrivateChatRequest", function(data){
      console.log(data["request"], data["opposite"], data["channel"]);
      //Make ending private chat request leave this private channel
      socket.leave(data["channel"]);
      socket.broadcast.to(data["channel"]).emit("endPrivateChatOppo", {channel:data["channel"], request:data["request"]});
  });

  socket.on("endPrivateChatOppoResponse", function(channel){
      //Make ending private chat opposite leave this private channel
      socket.leave(channel);

  });

  socket.on("kickoutRequest", function(data){
      var kickFlag,
          kickoutResMsg;
      console.log("On Kickout Request: ", data["kickee"], data["kicker"], data["room"]);
      if(data["kicker"] === ChatRoomOwners[data["room"]]){
          if(ChatRooms_Users[data["room"]].has(data["kickee"])){

              ChatRooms_Users[data["room"]].delete(data["kickee"]);

              kickFlag = true;
              kickoutResMsg = "You have kicked out " + data["kickee"] + "!";

              socket.broadcast.to(data["room"]).emit("findKickeeSocket", data["kickee"]);

              socket.emit("updateRoomUsers", Array.from(ChatRooms_Users[data["room"]]));
              socket.broadcast.to(data["room"]).emit("updateRoomUsers", Array.from(ChatRooms_Users[data["room"]]));

              socket.emit("kickoutResponse", {flag:kickFlag, resMsg:kickoutResMsg});
              
          }else{
              kickFlag = false;
              kickoutResMsg = "The user you want to kick out is not in this room currently.";
              socket.emit("kickoutResponse", {flag:kickFlag, resMsg:kickoutResMsg});
          }

      }else{
          kickFlag = false;
          kickoutResMsg = "You are not the owner of this room. You cannot kick out others.";
          socket.emit("kickoutResponse", {flag:kickFlag, resMsg:kickoutResMsg});
      }
  });

  socket.on("findKickeeSocketResponse", function(flag, room){
      if(flag === true){
          socket.leave(room);
      }

  });

  socket.on("banRequest", function(data){
      var banFlag,
          banResMsg;
      console.log("banRequest: ", data["bannee"], data["banner"], data["room"]);
      if(ChatRooms_Users[data["room"]].has(data["bannee"])){
          socket.broadcast.to(data["room"]).emit("findBannee", data["bannee"]);

      }else if(data["banner"] === ChatRoomOwners[data["room"]]){
          ChatRoomBanners[data["room"]].add(data["bannee"]);
          banFlag = true;
          banResMsg = "You have banned " + data["bannee"] + "!";
          socket.emit("banResponse", {flag:banFlag, resMsg:banResMsg});
          
      }else{
          banFlag = false;
          banResMsg = "You are not the owner of this room. You cannot ban others into this room.";
          socket.emit("banResponse", {flag:banFlag, resMsg:banResMsg});
      }

  });

  socket.on("unbanRequest", function(data){
      var unbanFlag,
          unbanResMsg;
      console.log("Unban Request: ", data["unbannee"], data["unbanner"], data["room"]);
      if(data["unbanner"] === ChatRoomOwners[data["room"]]){
        if(ChatRoomBanners[data["room"]].has(data["unbannee"])){
            ChatRoomBanners[data["room"]].delete(data["unbannee"]);
            unbanFlag = true;
            unbanResMsg = "You have unbanned " + data["unbannee"];
            socket.emit("unbanResponse", {flag:unbanFlag, resMsg:unbanResMsg});

        }else{
            unbanFlag = false;
            unbanResMsg = data["unbannee"] + " is not in the ban list currently.";
            socket.emit("unbanResponse", {flag:unbanFlag, resMsg:unbanResMsg});

        }

      }else{
          unbanFlag = false;
          unbanResMsg = "You are not the owner of this room. You cannot unban anyone."
          socket.emit("unbanResponse", {flag:unbanFlag, resMsg:unbanResMsg});

      }

  });

  socket.on("disconnect",function(data, username){
    console.log("disconnect: ", data, username);
  });

  
});