'use client'

import { useState, useEffect, useRef } from 'react'
import { LogOut, MessageSquare, Search, Send, Loader2, Settings, X, Upload, ChevronLeft } from 'lucide-react'
import { logout } from '@/app/login/actions'
import { createClient } from '@/utils/supabase/client'

export default function Dashboard({ currentUser }: { currentUser: any }) {
  const [selectedChat, setSelectedChat] = useState<any | null>(null)
  const [conversations, setConversations] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editUsername, setEditUsername] = useState(currentUser?.username || '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // NEW: Online & Typing State
  const [onlineUsers, setOnlineUsers] = useState<Record<string, any>>({})
  const [otherUserTyping, setOtherUserTyping] = useState(false)

  // MOBILE STATE: Tracks if we are looking at the chat or the list on small screens
  const [showChatOnMobile, setShowChatOnMobile] = useState(false)

  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    fetchConversations()
  }, [])

  useEffect(() => {
    if (!currentUser?.id) return

    const presenceChannel = supabase.channel('online-status')
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        setOnlineUsers(presenceChannel.presenceState())
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: currentUser.id,
            online_at: new Date().toISOString(),
          })
        }
      })

    const typingChannel = supabase.channel('typing-indicator')
    typingChannel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (selectedChat && payload.payload.userId === selectedChat.id) {
          setOtherUserTyping(payload.payload.isTyping)
        }
      })
      .subscribe()

    let messageChannel: any
    if (selectedChat?.conversation_id) {
      messageChannel = supabase
        .channel('realtime_messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedChat.conversation_id}`,
          },
          (payload) => {
            setMessages((prev) => [...prev, payload.new])
          }
        )
        .subscribe()
    }

    return () => {
      supabase.removeChannel(presenceChannel)
      supabase.removeChannel(typingChannel)
      if (messageChannel) supabase.removeChannel(messageChannel)
    }
  }, [selectedChat?.conversation_id, selectedChat?.id, currentUser, supabase])

  const fetchConversations = async () => {
    const { data: convos, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })

    if (error || !convos || convos.length === 0) return

    const otherUserIds = convos.map(c => c.user1_id === currentUser.id ? c.user2_id : c.user1_id)
    const { data: users } = await supabase.from('users').select('*').in('id', otherUserIds)

    if (users) {
      const formattedConversations = convos.map(c => {
        const otherUserId = c.user1_id === currentUser.id ? c.user2_id : c.user1_id
        const otherUser = users.find(u => u.id === otherUserId)
        return { conversation_id: c.id, ...otherUser }
      })
      setConversations(formattedConversations)
    }
  }

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    if (!query.trim()) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true)
    const { data, error } = await supabase.from('users').select('*').ilike('username', `%${query}%`).neq('id', currentUser.id).limit(5)
    if (!error && data) setSearchResults(data)
    setIsSearching(false)
  }

  const startOrSelectConversation = async (user: any) => {
    setSearchQuery(''); setSearchResults([])
    const existing = conversations.find(c => c.id === user.id)
    if (existing) {
      selectChat(existing);
      return;
    }

    const { data: existingDb } = await supabase
      .from('conversations')
      .select('*')
      .in('user1_id', [currentUser.id, user.id])
      .in('user2_id', [currentUser.id, user.id])
      .maybeSingle()

    let convId = existingDb?.id
    if (!convId) {
      const { data: newConvo } = await supabase.from('conversations').insert({ user1_id: currentUser.id, user2_id: user.id }).select().single()
      if (newConvo) convId = newConvo.id
    }

    const newChatObj = { conversation_id: convId, ...user }
    setConversations(prev => !prev.find(c => c.conversation_id === convId) ? [newChatObj, ...prev] : prev)
    selectChat(newChatObj)
  }

  const selectChat = async (chat: any) => {
    setSelectedChat(chat)
    setShowChatOnMobile(true) // Switch to chat view on mobile
    setIsLoadingMessages(true)
    if (chat.conversation_id) {
      const { data } = await supabase.from('messages').select('*').eq('conversation_id', chat.conversation_id).order('created_at', { ascending: true })
      if (data) setMessages(data)
    }
    setIsLoadingMessages(false)
  }

  const handleInputChange = (val: string) => {
    setNewMessage(val)
    if (!selectedChat) return
    supabase.channel('typing-indicator').send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, isTyping: val.length > 0 },
    })
  }

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMessage.trim() || !selectedChat?.conversation_id) return
    const content = newMessage.trim(); setNewMessage('')

    supabase.channel('typing-indicator').send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, isTyping: false },
    })

    await supabase.from('messages').insert({
      conversation_id: selectedChat.conversation_id,
      sender_id: currentUser.id,
      content: content
    })
  }

  const saveProfile = async () => {
    if (!editUsername.trim()) return; setIsSavingProfile(true)
    let avatarUrl = currentUser.avatar_url
    if (avatarFile) {
      const fileName = `${currentUser.id}-${Math.random()}.${avatarFile.name.split('.').pop()}`
      const { data } = await supabase.storage.from('avatars').upload(fileName, avatarFile)
      if (data) avatarUrl = supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl
    }
    const { error } = await supabase.from('users').update({ username: editUsername.trim(), avatar_url: avatarUrl }).eq('id', currentUser.id)
    setIsSavingProfile(false); if (!error) window.location.reload()
  }

  return (
    <div className="flex h-screen w-full bg-[#050505] text-white overflow-hidden relative font-sans">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{ background: `radial-gradient(circle at 15% 35%, rgba(255, 120, 0, 0.18) 0%, transparent 45%)` }}
      />

      {/* Sidebar - Hidden on mobile when chat is active */}
      <div className={`${showChatOnMobile ? 'hidden' : 'flex'} md:flex w-full md:w-80 border-r border-neutral-800/60 flex-col bg-black/40 backdrop-blur-2xl z-10`}>
        <div className="p-5 border-b border-neutral-800/60 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center font-bold overflow-hidden ring-2 ring-neutral-800">
              {currentUser?.avatar_url ? <img src={currentUser.avatar_url} className="w-full h-full object-cover" /> : currentUser?.username?.[0]?.toUpperCase()}
            </div>
            <span className="font-bold">{currentUser?.username}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-neutral-800 rounded-lg transition-all"><Settings size={18} className="text-neutral-400" /></button>
            <form action={logout}><button className="p-2 hover:bg-red-500/10 rounded-lg group"><LogOut size={18} className="text-neutral-400 group-hover:text-red-500" /></button></form>
          </div>
        </div>

        <div className="p-4 relative">
          <div className="relative group">
            <Search className="absolute left-3 top-2.5 text-neutral-500 group-focus-within:text-orange-500" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search users..."
              className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-orange-500/50 transition-all"
            />
          </div>
          {searchQuery && (
            <div className="absolute top-full left-4 right-4 mt-1 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-20">
              {isSearching ? <div className="p-3 text-center text-xs text-neutral-500"><Loader2 size={12} className="animate-spin inline mr-2" />Searching...</div> : searchResults.map(user => (
                <button key={user.id} onClick={() => startOrSelectConversation(user)} className="w-full text-left p-3 hover:bg-neutral-800 flex items-center gap-3">
                  <div className="w-8 h-8 bg-neutral-700 rounded-full overflow-hidden">{user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : user.username?.[0]}</div>
                  <span className="text-sm">{user.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map(chat => {
            const isOnline = onlineUsers[chat.id];
            return (
              <button
                key={chat.conversation_id}
                onClick={() => selectChat(chat)}
                className={`w-full text-left p-4 hover:bg-neutral-800/30 transition-all flex items-center gap-4 ${selectedChat?.conversation_id === chat.conversation_id ? 'bg-orange-500/10 border-r-2 border-orange-500' : ''}`}
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
                    {chat.avatar_url ? <img src={chat.avatar_url} className="w-full h-full object-cover" /> : chat.username?.[0]}
                  </div>
                  {isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-black rounded-full"></span>}
                </div>
                <div className="flex-1 overflow-hidden">
                  <span className={`text-sm font-semibold block ${selectedChat?.conversation_id === chat.conversation_id ? 'text-orange-400' : 'text-neutral-200'}`}>{chat.username}</span>
                  <span className="text-xs text-neutral-500 truncate block">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Chat Area - Hidden on mobile if sidebar is visible */}
      <div className={`${!showChatOnMobile ? 'hidden' : 'flex'} md:flex flex-1 flex-col bg-transparent relative z-10`}>
        {selectedChat ? (
          <div className="flex-1 flex flex-col h-full">
            <div className="h-16 md:h-20 border-b border-neutral-800/60 flex items-center px-4 md:px-8 bg-black/20 backdrop-blur-md">

              {/* BACK BUTTON: Only visible on mobile */}
              <button
                onClick={() => setShowChatOnMobile(false)}
                className="md:hidden p-2 -ml-2 mr-2 hover:bg-neutral-800 rounded-full transition-all"
              >
                <ChevronLeft size={24} className="text-neutral-400" />
              </button>

              <div className="w-10 h-10 bg-neutral-800 rounded-full mr-3 md:mr-4 overflow-hidden border border-neutral-700 shrink-0">
                {selectedChat.avatar_url ? <img src={selectedChat.avatar_url} className="w-full h-full object-cover" /> : selectedChat.username?.[0]}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg md:text-xl tracking-tight">{selectedChat.username}</span>
                <span className="text-xs font-medium">
                  {otherUserTyping ? <span className="text-orange-400 animate-pulse">typing...</span> : (onlineUsers[selectedChat.id] ? <span className="text-green-500">Online</span> : <span className="text-neutral-500">Offline</span>)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
              {isLoadingMessages ? (
                <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" size={32} /></div>
              ) : messages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] md:max-w-[65%] rounded-2xl px-4 md:px-5 py-2 md:py-3 shadow-xl ${msg.sender_id === currentUser.id ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-neutral-800/80 text-neutral-100 rounded-tl-none border border-neutral-700/50 backdrop-blur-sm'}`}>
                    <p className="text-[14px] md:text-[15px] leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 md:p-6 bg-black/40 backdrop-blur-xl border-t border-neutral-800/60">
              <form onSubmit={sendMessage} className="flex items-center gap-2 md:gap-3 max-w-5xl mx-auto">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-neutral-900/80 border border-neutral-800 rounded-2xl py-3 md:py-4 px-4 md:px-6 focus:outline-none focus:border-orange-500/50 transition-all text-sm md:text-base"
                />
                <button type="submit" disabled={!newMessage.trim()} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white rounded-2xl p-3 md:p-4 shadow-lg shadow-orange-900/20 transition-all shrink-0"><Send size={20} /></button>
              </form>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center p-10">
            <div className="bg-neutral-900/40 border border-neutral-800/60 p-12 rounded-[2rem] backdrop-blur-xl text-center shadow-2xl max-w-md">
              <div className="w-24 h-24 bg-gradient-to-b from-orange-500 to-orange-700 rounded-3xl flex items-center justify-center mb-8 mx-auto rotate-3 shadow-2xl"><MessageSquare size={48} className="text-white -rotate-3" /></div>
              <h2 className="text-3xl font-black mb-4 tracking-tighter">Welcome to XChat</h2>
              <p className="text-neutral-400 text-sm">Select a conversation to start messaging.</p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#111] border border-neutral-800 p-6 md:p-8 rounded-[2rem] w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl md:text-2xl font-black text-white tracking-tighter">Profile</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-neutral-800 rounded-full text-neutral-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <label htmlFor="avatar-upload" className="relative group cursor-pointer w-24 md:w-28 h-24 md:h-28 rounded-3xl overflow-hidden border-2 border-neutral-800 hover:border-orange-500 transition-all">
                  {avatarFile ? <img src={URL.createObjectURL(avatarFile)} className="w-full h-full object-cover" /> : (currentUser?.avatar_url ? <img src={currentUser.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-neutral-600 font-bold text-2xl md:text-3xl">{currentUser?.username?.[0]?.toUpperCase()}</div>)}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/60 transition-opacity"><Upload size={24} className="text-white" /></div>
                </label>
                <input id="avatar-upload" type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} className="hidden" />
              </div>
              <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl py-3 md:py-4 px-5 text-white" />
              <button onClick={saveProfile} disabled={isSavingProfile} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-2xl py-3 md:py-4 font-bold shadow-lg shadow-orange-900/20 transition-all disabled:opacity-50">{isSavingProfile ? 'Updating...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}