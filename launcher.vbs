Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Users\admin\powerbi-chatbot-server\start-server.cmd""", 0, False
sh.Run """C:\Users\admin\powerbi-chatbot-server\start-tunnel.cmd""", 0, False
