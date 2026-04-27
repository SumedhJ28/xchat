'use client'

import { useState, useEffect, useRef } from 'react'
import { LogOut, MessageSquare, Search, Send, Loader2, Settings, X, Upload } from 'lucide-react'
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
  const [imageFile, setImageFile] = useState<File | null>(null)

  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    fetchConversations()
  }, [])

  useEffect(() => {
    if (!selectedChat?.conversation_id) return

    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedChat?.conversation_id, supabase])

  const fetchConversations = async () => {
    const { data: convos, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })

    if (error || !convos || convos.length === 0) return

    const otherUserIds = convos.map(c => c.user1_id === currentUser.id ? c.user2_id : c.user1_id)

    const { data: users } = await supabase
      .from('users')
      .select('*')
      .in('id', otherUserIds)

    if (users) {
      const formattedConversations = convos.map(c => {
        const otherUserId = c.user1_id === currentUser.id ? c.user2_id : c.user1_id
        const otherUser = users.find(u => u.id === otherUserId)
        return {
          conversation_id: c.id,
          ...otherUser
        }
      })
      setConversations(formattedConversations)
    }
  }

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)

    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${query}%`)
      .neq('id', currentUser.id)
      .limit(5)

    if (!error && data) {
      setSearchResults(data)
    }
    setIsSearching(false)
  }

  const startOrSelectConversation = async (user: any) => {
    setSearchQuery('')
    setSearchResults([])

    const existing = conversations.find(c => c.id === user.id)
    if (existing) {
      selectChat(existing)
      return
    }

    const { data: existingDb } = await supabase
      .from('conversations')
      .select('*')
      .in('user1_id', [currentUser.id, user.id])
      .in('user2_id', [currentUser.id, user.id])
      .maybeSingle()

    let convId = existingDb?.id

    if (!convId) {
      const { data: newConvo, error } = await supabase
        .from('conversations')
        .insert({ user1_id: currentUser.id, user2_id: user.id })
        .select()
        .single()

      if (newConvo) convId = newConvo.id
    }

    const newChatObj = { conversation_id: convId, ...user }

    setConversations(prev => {
      if (!prev.find(c => c.conversation_id === convId)) {
        return [newChatObj, ...prev]
      }
      return prev
    })

    selectChat(newChatObj)
  }

  const selectChat = async (chat: any) => {
    setSelectedChat(chat)
    setIsLoadingMessages(true)

    if (chat.conversation_id) {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', chat.conversation_id)
        .order('created_at', { ascending: true })

      if (data) setMessages(data)
    }

    setIsLoadingMessages(false)
  }

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMessage.trim() || !selectedChat?.conversation_id) return

    const messageContent = newMessage.trim()
    setNewMessage('')

    await supabase
      .from('messages')
      .insert({
        conversation_id: selectedChat.conversation_id,
        sender_id: currentUser.id,
        content: messageContent
      })
  }

  const saveProfile = async () => {
    if (!editUsername.trim()) return

    setIsSavingProfile(true)
    let avatarUrl = currentUser.avatar_url

    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop()
      const fileName = `${currentUser.id}-${Math.random()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile)

      if (uploadData && !uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName)
        avatarUrl = publicUrlData.publicUrl
      } else {
        console.error("Upload error:", uploadError)
        alert("Failed to upload image: " + uploadError?.message)
        setIsSavingProfile(false)
        return
      }
    }

    const { error } = await supabase
      .from('users')
      .update({ username: editUsername.trim(), avatar_url: avatarUrl })
      .eq('id', currentUser.id)

    setIsSavingProfile(false)
    if (!error) {
      window.location.reload()
    }
  }

  return (
    <div className="flex h-screen w-full bg-neutral-900 text-white overflow-hidden relative">
      {/* Sidebar */}
      <div className="w-80 border-r border-neutral-800 flex flex-col bg-neutral-950 shadow-xl z-10">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center font-bold text-white shadow-lg overflow-hidden">
              {currentUser?.avatar_url ? (
                <img src={currentUser.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                currentUser?.username?.[0]?.toUpperCase() || 'U'
              )}
            </div>
            <span className="font-semibold text-neutral-200">{currentUser?.username}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-neutral-800 rounded-full transition-all hover:text-blue-400">
              <Settings size={18} className="text-neutral-400 hover:text-blue-400" />
            </button>
            <form action={logout}>
              <button className="p-2 hover:bg-neutral-800 rounded-full transition-all hover:text-red-400">
                <LogOut size={18} className="text-neutral-400 hover:text-red-400" />
              </button>
            </form>
          </div>
        </div>

        <div className="p-4 relative">
          <div className="relative group">
            <Search className="absolute left-3 top-2.5 text-neutral-500 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search users to chat..."
              className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-600"
            />
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && (
            <div className="absolute top-full left-4 right-4 mt-1 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-20">
              {isSearching ? (
                <div className="p-3 text-center text-sm text-neutral-400 flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Searching...
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => startOrSelectConversation(user)}
                    className="w-full text-left p-3 hover:bg-neutral-700 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 bg-neutral-600 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        user.username?.[0]?.toUpperCase()
                      )}
                    </div>
                    <span className="text-sm font-medium">{user.username}</span>
                  </button>
                ))
              ) : (
                <div className="p-3 text-center text-sm text-neutral-400">No users found</div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length > 0 ? (
            conversations.map(chat => (
              <button
                key={chat.conversation_id}
                onClick={() => selectChat(chat)}
                className={`w-full text-left p-4 hover:bg-neutral-800/50 transition-colors flex items-center gap-3 border-b border-neutral-800/50 ${selectedChat?.conversation_id === chat.conversation_id ? 'bg-neutral-800/80' : ''}`}
              >
                <div className="w-10 h-10 bg-gradient-to-br from-neutral-600 to-neutral-800 rounded-full flex items-center justify-center text-sm font-bold shadow-md overflow-hidden shrink-0">
                  {chat.avatar_url ? (
                    <img src={chat.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    chat.username?.[0]?.toUpperCase()
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <span className="text-sm font-medium text-neutral-200">{chat.username}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4 mt-10">
              <div className="w-12 h-12 bg-neutral-900 rounded-full flex items-center justify-center mb-3">
                <Search className="text-neutral-600" size={24} />
              </div>
              <p className="text-neutral-500 text-sm">No conversations yet.<br />Search for a user to start!</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0a0a0a] relative">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

        {selectedChat ? (
          <div className="flex-1 flex flex-col relative z-10 h-full">
            {/* Chat Header */}
            <div className="h-16 border-b border-neutral-800 flex items-center px-6 bg-neutral-950/80 backdrop-blur-md shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-neutral-600 to-neutral-800 rounded-full flex items-center justify-center text-xs font-bold mr-3 overflow-hidden">
                {selectedChat.avatar_url ? (
                  <img src={selectedChat.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  selectedChat.username?.[0]?.toUpperCase()
                )}
              </div>
              <span className="font-semibold text-lg">{selectedChat.username}</span>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isLoadingMessages ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-neutral-500" size={32} />
                </div>
              ) : messages.length > 0 ? (
                messages.map((msg, i) => {
                  const isMine = msg.sender_id === currentUser.id
                  return (
                    <div key={msg.id || i} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${isMine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-neutral-800 text-neutral-100 rounded-bl-sm border border-neutral-700/50'}`}>
                        {msg.content}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-500">
                  No messages yet. Say hi!
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-neutral-950/80 backdrop-blur-md border-t border-neutral-800 shrink-0">
              <form onSubmit={sendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded-full py-3 px-6 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="bg-blue-600 disabled:bg-blue-800 disabled:opacity-50 hover:bg-blue-500 text-white rounded-full p-3 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/25"
                >
                  <Send size={20} className="ml-1" />
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 relative z-10">
            <div className="w-20 h-20 bg-neutral-900/50 rounded-2xl flex items-center justify-center mb-6 shadow-2xl border border-neutral-800/50">
              <MessageSquare size={40} className="text-blue-500" />
            </div>
            <h2 className="text-2xl font-medium text-neutral-200 mb-2">Welcome to Chat App</h2>
            <p className="text-neutral-500 text-center max-w-sm">Select a conversation from the sidebar or search for a new user to start messaging.</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-white">Edit Profile</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2 text-center">Profile Picture</label>
                <div className="flex flex-col items-center gap-3">
                  <label htmlFor="avatar-upload" className="relative group cursor-pointer w-20 h-20 rounded-full overflow-hidden border-2 border-neutral-700 hover:border-blue-500 transition-all shadow-lg shrink-0">
                    {avatarFile ? (
                      <img src={URL.createObjectURL(avatarFile)} alt="preview" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                    ) : currentUser?.avatar_url ? (
                      <img src={currentUser.avatar_url} alt="current" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                    ) : (
                      <div className="w-full h-full bg-neutral-800 flex items-center justify-center group-hover:opacity-50 transition-opacity">
                        <Upload size={24} className="text-neutral-500" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                      <span className="text-white text-xs font-medium">Change</span>
                    </div>
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  {avatarFile && <span className="text-xs text-neutral-400 truncate max-w-[200px]">{avatarFile.name}</span>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-4 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <button
                onClick={saveProfile}
                disabled={isSavingProfile}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 font-medium transition-colors disabled:opacity-50"
              >
                {isSavingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
